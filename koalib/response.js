
'use strict';

/**
 * Module dependencies.
 */

const contentDisposition = require('content-disposition');
const ensureErrorHandler = require('error-inject');
const getType = require('mime-types').contentType;
const onFinish = require('on-finished');
const isJSON = require('koa-is-json');
const escape = require('escape-html');
const typeis = require('type-is').is;
const statuses = require('statuses');
const destroy = require('destroy');
const assert = require('assert');
const extname = require('path').extname;
const vary = require('vary');
const only = require('only');

/**
 * Prototype.
 */

module.exports = {

  /**
   * Return the request socket.
   * 返回请求套接字 socket
   * 
   * @return {Connection}
   * @api public
   */

  get socket() {
    return this.ctx.req.socket;
  },

  /**
   * Return response header.
   * 返回响应头对象
   * 
   * @return {Object}
   * @api public
   */

  get header() {
    const { res } = this;
    return typeof res.getHeaders === 'function'
      ? res.getHeaders() // 返回当前响应头文件的浅拷贝，这是 v7.7 新增的
      : res._headers || {};  // Node < 7.7
  },

  /**
   * Return response header, alias as response.header
   * 返回响应头对象，是 response.header 的别名
   * 
   * @return {Object}
   * @api public
   */

  get headers() {
    return this.header;
  },

  /**
   * Get response status code.
   * 获取响应的状态码
   * 
   * @return {Number}
   * @api public
   */

  get status() {
    return this.res.statusCode;
  },

  /**
   * Set response status code.
   * 设置响应的状态码
   * 
   * @param {Number} code
   * @api public
   */

  set status(code) {
    // 对于已经发送了一个响应头的情况，直接返回
    if (this.headerSent) return;

    assert('number' == typeof code, 'status code must be a number');
    assert(statuses[code], `invalid status code: ${code}`);
    
    this._explicitStatus = true;
    this.res.statusCode = code; // 设置响应头状态码

    // 对于 http/2.0 以下版本，设置状态信息
    if (this.req.httpVersionMajor < 2) this.res.statusMessage = statuses[code];

    // 对于期望 body 为空的状态码(204/205/304)，设置响应实体为 null
    if (this.body && statuses.empty[code]) this.body = null;
  },

  /**
   * Get response status message
   * 获取响应状态信息，可以设置，默认会与响应码相对应
   * 
   * @return {String}
   * @api public
   */

  get message() {
    return this.res.statusMessage || statuses[this.status];
  },

  /**
   * Set response status message
   * 设置响应状态信息
   * 
   * @param {String} msg
   * @api public
   */

  set message(msg) {
    this.res.statusMessage = msg;
  },

  /**
   * Get response body.
   * 获取响应主体
   * 
   * @return {Mixed}
   * @api public
   */

  get body() {
    return this._body;
  },

  /**
   * Set response body.
   * 设置响应主体
   * 
   * @param {String|Buffer|Object|Stream} val
   * @api public
   */

  set body(val) {
    const original = this._body; // 缓存原先的响应主体
    this._body = val;

    // no content 无内容响应的情形
    if (null == val) {
      // 没有值的且状态码不是 204/205/304 之一的，默认修改状态码为 204
      if (!statuses.empty[this.status]) this.status = 204;

      // 移除特定响应头
      this.remove('Content-Type');
      this.remove('Content-Length');
      this.remove('Transfer-Encoding');
      return;
    }

    // set the status
    // 未曾设置 statusd 的话，设置 body 的同时会顺便设置 status 属性值为 200
    if (!this._explicitStatus) this.status = 200;

    // set the content-type only if not yet set
    // setType 为 true 的话表示还未曾设置 content-type
    const setType = !this.header['content-type'];

    // string 写入的情形
    if ('string' == typeof val) {
      // 有疑似标签符号 < 开头的就认为是 html，其余皆是 text
      if (setType) this.type = /^\s*</.test(val) ? 'html' : 'text';
      this.length = Buffer.byteLength(val); // 获取字符串的实际字节长度
      return;
    }

    // buffer 写入的情形
    if (Buffer.isBuffer(val)) {
      if (setType) this.type = 'bin';
      this.length = val.length; // 获取在字节数上分配的内存量
      return;
    }

    // stream 写入的情形
    if ('function' == typeof val.pipe) {
      onFinish(this.res, destroy.bind(null, val));
      ensureErrorHandler(val, err => this.ctx.onerror(err));

      // overwriting
      if (null != original && original != val) this.remove('Content-Length');

      if (setType) this.type = 'bin';
      return;
    }

    // json 字符串的情形
    this.remove('Content-Length');
    this.type = 'json';
  },

  /**
   * Set Content-Length field to `n`.
   * 设置 length 属性，就会设置 content-length 头
   * 
   * @param {Number} n
   * @api public
   */

  set length(n) {
    this.set('Content-Length', n);
  },

  /**
   * Return parsed response Content-Length when present.
   * 以数字返回响应的 Content-Length，或者从 ctx.body 推导出来，或者 undefined
   * 
   * @return {Number}
   * @api public
   */

  get length() {
    const len = this.header['content-length'];
    const body = this.body;

    if (null == len) {
      if (!body) return;
      if ('string' == typeof body) return Buffer.byteLength(body);
      if (Buffer.isBuffer(body)) return body.length;
      if (isJSON(body)) return Buffer.byteLength(JSON.stringify(body));
      return;
    }

    return ~~len;
  },

  /**
   * Check if a header has been written to the socket.
   * 如果响应头已被发送则为 true，否则为 false
   * 
   * @return {Boolean}
   * @api public
   */

  get headerSent() {
    return this.res.headersSent;
  },

  /**
   * Vary on `field`.
   *
   * @param {String} field
   * @api public
   */

  vary(field) {
    // 对于已经发送了一个响应头的情况，直接返回
    if (this.headerSent) return;

    vary(this.res, field);
  },

  /**
   * Perform a 302 redirect to `url`.
   * 执行 [302] 重定向到 url.
   *
   * The string "back" is special-cased
   * to provide Referrer support, when Referrer
   * is not present `alt` or "/" is used.
   * 字符串 back 是特别提供 Referrer 支持的，当 Referrer 不存在时，使用 alt 或 / 作为目标 url
   * 
   * Examples:
   *
   *    this.redirect('back');
   *    this.redirect('back', '/index.html'); 没有 Referrer 就使用 index.html
   *    this.redirect('/login');
   *    this.redirect('http://google.com');
   *
   * @param {String} url
   * @param {String} [alt]
   * @api public
   */

  redirect(url, alt) {
    // location
    if ('back' == url) url = this.ctx.get('Referrer') || alt || '/';
    this.set('Location', url); // 设置 Location 响应头

    // status 状态码不属于重定向(300/301/302/303/305/307/308/)的，默认设为 302
    if (!statuses.redirect[this.status]) this.status = 302;

    // html 对于请求头 Accept 字段规定接受 html 的
    if (this.ctx.accepts('html')) {
      url = escape(url);
      this.type = 'text/html; charset=utf-8';
      this.body = `Redirecting to <a href="${url}">${url}</a>.`;
      return;
    }

    // text
    this.type = 'text/plain; charset=utf-8';
    this.body = `Redirecting to ${url}.`;
  },

  /**
   * Set Content-Disposition header to "attachment" with optional `filename`.
   * 设置 Content-Disposition 头为 attachment，可以传入文件名参数 filename
   * 
   * 在HTTP场景中，(https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Headers/Content-Disposition)
   * 第一个参数或者是 inline（默认值，表示回复中的消息体会以页面的一部分或者整个页面的形式展示），
   * 或者是attachment（意味着消息体应该被下载到本地；大多数浏览器会呈现一个“保存为”的对话框，将filename的值预填为下载后的文件名，假如它存在的话）。
   * 
   * @param {String} filename
   * @api public
   */

  attachment(filename) {
    if (filename) this.type = extname(filename);
    this.set('Content-Disposition', contentDisposition(filename));
  },

  /**
   * Set Content-Type response header with `type` through `mime.lookup()`
   * when it does not contain a charset.
   *
   * Examples:
   *
   *     this.type = '.html';
   *     this.type = 'html';
   *     this.type = 'json';
   *     this.type = 'application/json';
   *     this.type = 'png';
   *
   * @param {String} type
   * @api public
   */

  set type(type) {
    type = getType(type); // 获得完整的 content-type
    if (type) {
      this.set('Content-Type', type);
    } else {
      this.remove('Content-Type');
    }
  },

  /**
   * Set the Last-Modified date using a string or a Date.
   * 设置 Last-Modified 值
   * 
   *     this.response.lastModified = new Date();
   *     this.response.lastModified = '2013-09-13';
   *
   * @param {String|Date} type
   * @api public
   */

  set lastModified(val) {
    if ('string' == typeof val) val = new Date(val);
    this.set('Last-Modified', val.toUTCString());
  },

  /**
   * Get the Last-Modified date in Date form, if it exists.
   * 获取 Last-Modified 值
   * 
   * @return {Date}
   * @api public
   */

  get lastModified() {
    const date = this.get('last-modified');
    if (date) return new Date(date);
  },

  /**
   * Set the ETag of a response.
   * This will normalize the quotes if necessary.
   * 设置 ETag
   *     this.response.etag = 'md5hashsum';
   *     this.response.etag = '"md5hashsum"';
   *     this.response.etag = 'W/"123456789"';
   *
   * @param {String} etag
   * @api public
   */

  set etag(val) {
    // 格式化字串，非 W/" 或 " 开头的，包裹一层 "
    if (!/^(W\/)?"/.test(val)) val = `"${val}"`;
    this.set('ETag', val);
  },

  /**
   * Get the ETag of a response.
   * 获取 ETag
   * 
   * @return {String}
   * @api public
   */

  get etag() {
    return this.get('ETag');
  },

  /**
   * Return the response mime type void of
   * parameters such as "charset".
   * 获取响应 Content-Type 不含参数 charset（像 utf-8 之类的）
   * 
   * @return {String}
   * @api public
   */

  get type() {
    const type = this.get('Content-Type');
    if (!type) return '';
    return type.split(';')[0];
  },

  /**
   * Check whether the response is one of the listed types.
   * Pretty much the same as `this.request.is()`.
   * 判断响应类型是否是所提供的类型之一，类似于 ctx.request.is()
   * 
   * @param {String|Array} types...
   * @return {String|false}
   * @api public
   */

  is(types) {
    const type = this.type; // 当前响应的 type
    if (!types) return type || false;
    // 可以传入一个数组；也可以直接传一系列参数，这些参数会被转换成数组
    if (!Array.isArray(types)) types = [].slice.call(arguments);
    return typeis(type, types);
  },

  /**
   * Return response header.
   * 获取某一响应头对应的值
   * 
   * Examples:
   *
   *     this.get('Content-Type');
   *     // => "text/plain"
   *
   *     this.get('content-type');
   *     // => "text/plain"
   *
   * @param {String} field
   * @return {String}
   * @api public
   */

  get(field) {
    // 通过 getter 取当前响应头，实际调用的是 response.getHeaders() 方法，获得的所有响应头名称都是小写的
    return this.header[field.toLowerCase()] || '';
  },

  /**
   * Set header `field` to `val`, or pass
   * an object of header fields.
   * 设置响应头属性值，可以传递一个对象
   * 
   * Examples:
   *
   *    this.set('Foo', ['bar', 'baz']); 对于值为数组的，将每一项转换成字符串
   *    this.set('Accept', 'application/json');
   *    this.set({ Accept: 'text/plain', 'X-API-Key': 'tobi' }); 传递一个对象
   *
   * @param {String|Object|Array} field
   * @param {String} val
   * @api public
   */

  set(field, val) {
    // 对于已经发送了一个响应头的情况，直接返回
    if (this.headerSent) return;

    // 传递了两个参数，作为键值对处理
    if (2 == arguments.length) {
      // 将值转换成字符串
      if (Array.isArray(val)) val = val.map(String); // 对于数组就逐项转换
      else val = String(val);

      // 为一个隐式的响应头设置值
      // 如果该响应头已存在，则值会被覆盖
      // 如果要发送多个名称相同的响应头，则使用字符串数组
      this.res.setHeader(field, val);
    } else {
      // 传递了一个参数，当做对象处理
      for (const key in field) {
        this.set(key, field[key]);
      }
    }
  },

  /**
   * Append additional header `field` with value `val`.
   * 在某个头字段上添加新的值
   * 
   * Examples:
   *
   * ```
   * this.append('Link', ['<http://localhost/>', '<http://localhost:3000/>']);
   * this.append('Set-Cookie', 'foo=bar; Path=/; HttpOnly');
   * this.append('Warning', '199 Miscellaneous warning');
   * ```
   *
   * @param {String} field
   * @param {String|Array} val
   * @api public
   */

  append(field, val) {
    const prev = this.get(field);

    if (prev) {
      val = Array.isArray(prev)
        ? prev.concat(val)
        : [prev].concat(val); // 旧值格式化成数组再加上新值
    }

    return this.set(field, val);
  },

  /**
   * Remove header `field`.
   * 移除特定响应头
   * 
   * @param {String} name
   * @api public
   */

  remove(field) {
    // 对于已经发送了一个响应头的情况，直接返回
    if (this.headerSent) return;
    // 从隐式发送的队列中移除一个响应头
    this.res.removeHeader(field);
  },

  /**
   * Checks if the request is writable.
   * Tests for the existence of the socket
   * as node sometimes does not set it.
   *
   * @return {Boolean}
   * @api private
   */

  get writable() {
    // can't write any more after response finished
    if (this.res.finished) return false;

    const socket = this.res.socket;
    // There are already pending outgoing res, but still writable
    // https://github.com/nodejs/node/blob/v4.4.7/lib/_http_server.js#L486
    if (!socket) return true;
    return socket.writable;
  },

  /**
   * Inspect implementation.
   *
   * @return {Object}
   * @api public
   */

  inspect() {
    if (!this.res) return;
    const o = this.toJSON();
    o.body = this.body;
    return o;
  },

  /**
   * Return JSON representation.
   *
   * @return {Object}
   * @api public
   */

  toJSON() {
    return only(this, [
      'status',
      'message',
      'header'
    ]);
  },

  /**
   * Flush any set headers, and begin the body
   * 刷新请求头
   */
  flushHeaders() {
    this.res.flushHeaders();
  }
};
