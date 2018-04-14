'use strict'

/**
 * Expose compositor.
 */

module.exports = compose

/**
 * Compose `middleware` returning
 * a fully valid middleware comprised
 * of all those which are passed.
 *
 * @param {Array} middleware
 * @return {Function}
 * @api public
 */

function compose (middleware) {
  // 检查中间件们存放的栈，它应该是个数组
  if (!Array.isArray(middleware)) throw new TypeError('Middleware stack must be an array!')
  // 检查中间件们，每个中间件都应该是一个函数
  for (const fn of middleware) {
    if (typeof fn !== 'function') throw new TypeError('Middleware must be composed of functions!')
  }

  /**
   * @param {Object} context
   * @return {Promise}
   * @api public
   */

  return function (context, next) {
    // last called middleware #
    let index = -1
    return dispatch(0)
    function dispatch (i) {
      // 当前中间件中调用 next 的话，会调用 dispatch(i+1) 来更新 index
      // 若当前中间件中第二次调用 next 的话，会第二次调用 dispatch(i+1)，就会在 dispatch(i+1) 中报错
      if (i <= index) return Promise.reject(new Error('next() called multiple times'))

      index = i // 更新 index
      let fn = middleware[i] // 取一个中间件

      // 调用最后一个中间件的 next 方法，赋值 'fn = next' 中的 next 没有传值的话就是 undefined，直接返回 Promise.resolve()
      // koa 中使用 compose 的时候就未向参数 next 传值，因此直接返回 Promise.resolve()
      // 当然手动调用 compose 的时候可以传一个 next 进去
      if (i === middleware.length) fn = next
      if (!fn) return Promise.resolve()

      try {
        // 执行当前中间件的代码逻辑，中间件第二个参数传入的是 next 供中间件内部调用
        // 当遇到该中间件内调用 next 方法的时候，会执行 dispatch 方法来调用下一个中间件
        return Promise.resolve(fn(context, function next () {
          return dispatch(i + 1)
        }))
      } catch (err) {
        return Promise.reject(err)
      }
    }
  }
}
