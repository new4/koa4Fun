
'use strict';

/**
 * Module dependencies.
 */

const isGeneratorFunction = require('is-generator-function'); // 判断是否是 generator 函数的
const debug = require('debug')('koa:application');
const onFinished = require('on-finished');
const response = require('./response');
const compose = require('koa-compose'); // 组合中间件函数的
const isJSON = require('koa-is-json');
const context = require('./context');
const request = require('./request');
const statuses = require('statuses');
const Cookies = require('cookies');
const accepts = require('accepts');
const Emitter = require('events');
const assert = require('assert');
const Stream = require('stream');
const http = require('http');
const only = require('only'); // 取出对象的一个子集
const convert = require('koa-convert');
const deprecate = require('depd')('koa');

/**
 * Expose `Application` class.
 * Inherits from `Emitter.prototype`.
 * 从 `Emitter.prototype` 继承
 */

module.exports = class Application extends Emitter {
  /**
   * Initialize a new `Application`.
   *
   * @api public
   */
  // 构造函数
  constructor() {
    super();

    // 定义一些实例上的属性
    this.proxy = false; // 当真正的代理头字段将被信任时为 true
    this.middleware = []; // 储存中间件的栈
    this.subdomainOffset = 2; // 对于要忽略的 .subdomains 偏移
    this.env = process.env.NODE_ENV || 'development'; // 默认是 NODE_ENV 或 "development"

    // 原型式继承，可以索引到原型链上的属性，也可以通过在实例上自定义属性来屏蔽掉原型链上的属性
    this.context = Object.create(context);
    this.request = Object.create(request);
    this.response = Object.create(response);
  }

  /**
   * Shorthand for:
   * 下面代码的语法糖
   *    http.createServer(app.callback()).listen(...)
   *
   * @param {Mixed} ...
   * @return {Server}
   * @api public
   */
  // 创建并返回 HTTP 服务器，将给定的参数传递给 server.listen()
  listen(...args) {
    debug('listen');
    // 将 this.callback 调用后返回的函数作为回调函数
    const server = http.createServer(this.callback());
    return server.listen(...args);
  }

  /**
   * Return JSON representation.
   * We only bother showing settings.
   *
   * @return {Object}
   * @api public
   */

  toJSON() {
    // 只取这三个属性来显示
    return only(this, [
      'subdomainOffset',
      'proxy',
      'env'
    ]);
  }

  /**
   * Inspect implementation.
   *
   * @return {Object}
   * @api public
   */
  // 取那三个属性
  inspect() {
    return this.toJSON();
  }

  /**
   * Use the given middleware `fn`.
   *
   * Old-style middleware will be converted.
   *
   * @param {Function} fn
   * @return {Application} self
   * @api public
   */
  // 将给定的中间件方法 fn 添加到此应用程序
  use(fn) {
    // 中间件方法必须是一个函数
    if (typeof fn !== 'function') throw new TypeError('middleware must be a function!');
    // 判断 fn 是否是 Generator 函数
    // 若是，使用 koa-convert 来把 generator 中间件转成 promise 形式中间件
    // 推荐使用 async 函数来书写中间件
    if (isGeneratorFunction(fn)) {
      deprecate('Support for generators will be removed in v3. ' +
                'See the documentation for examples of how to convert old middleware ' +
                'https://github.com/koajs/koa/blob/master/docs/migration.md');
      fn = convert(fn);
    }
    debug('use %s', fn._name || fn.name || '-');
    this.middleware.push(fn); // 中间件入栈
    return this; // 返回实例
  }

  /**
   * Return a request handler callback
   * for node's native http server.
   *
   * @return {Function}
   * @api public
   */
  // 返回适用于 http.createServer() 方法的回调函数来处理请求
  callback() {
    // 先组合中间件，组合之后返回一个函数 fn，fn 返回 Promise
    const fn = compose(this.middleware); 

    // 没有注册监听 error 事件的处理函数时，帮忙注册一个处理函数 this.onerror
    if (!this.listeners('error').length) this.on('error', this.onerror);

    // 回调函数，接收参数 req - 请求对象；res - 响应对象
    const handleRequest = (req, res) => {
      const ctx = this.createContext(req, res);
      return this.handleRequest(ctx, fn);
    };

    return handleRequest;
  }

  /**
   * Handle request in callback.
   *
   * @api private
   */

  handleRequest(ctx, fnMiddleware) {
    const res = ctx.res;
    res.statusCode = 404; // 状态码初始默认 404
    const onerror = err => ctx.onerror(err); // 处理中间件出错情形
    const handleResponse = () => respond(ctx); // 处理完所有中间件之后调用
    onFinished(res, onerror);
    return fnMiddleware(ctx).then(handleResponse).catch(onerror);
  }

  /**
   * Initialize a new context.
   *
   * @api private
   */

  createContext(req, res) {
    // 原型式继承
    const context = Object.create(this.context);
    const request = context.request = Object.create(this.request);
    const response = context.response = Object.create(this.response);

    // 添加属性，构成互相引用的关系
    context.app = request.app = response.app = this;
    context.req = request.req = response.req = req;
    context.res = request.res = response.res = res;
    request.ctx = response.ctx = context;
    request.response = response;
    response.request = request;

    context.originalUrl = request.originalUrl = req.url;
    context.cookies = new Cookies(req, res, {
      keys: this.keys,
      secure: request.secure
    });
    request.ip = request.ips[0] || req.socket.remoteAddress || '';
    context.accept = request.accept = accepts(req);
    context.state = {};
    return context;
  }

  /**
   * Default error handler.
   *
   * @param {Error} err
   * @api private
   */

  onerror(err) {
    assert(err instanceof Error, `non-error thrown: ${err}`);

    if (404 == err.status || err.expose) return;
    // 实例属性 silent 设置为 true 的话，不输出错误，直接返回
    if (this.silent) return; 

    const msg = err.stack || err.toString();
    console.error();
    console.error(msg.replace(/^/gm, '  '));
    console.error();
  }
};

/**
 * Response helper.
 */

function respond(ctx) {
  // allow bypassing koa
  if (false === ctx.respond) return;

  const res = ctx.res;
  if (!ctx.writable) return;

  let body = ctx.body;
  const code = ctx.status;

  // ignore body
  if (statuses.empty[code]) {
    // strip headers
    ctx.body = null;
    return res.end();
  }

  if ('HEAD' == ctx.method) {
    if (!res.headersSent && isJSON(body)) {
      ctx.length = Buffer.byteLength(JSON.stringify(body));
    }
    return res.end();
  }

  // status body
  if (null == body) {
    body = ctx.message || String(code);
    if (!res.headersSent) {
      ctx.type = 'text';
      ctx.length = Buffer.byteLength(body);
    }
    return res.end(body);
  }

  // responses
  if (Buffer.isBuffer(body)) return res.end(body);
  if ('string' == typeof body) return res.end(body);
  if (body instanceof Stream) return body.pipe(res);

  // body: json
  body = JSON.stringify(body);
  if (!res.headersSent) {
    ctx.length = Buffer.byteLength(body);
  }
  res.end(body);
}
