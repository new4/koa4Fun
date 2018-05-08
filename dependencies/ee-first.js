/*!
 * ee-first
 * Copyright(c) 2014 Jonathan Ong
 * MIT Licensed
 */

'use strict'

/**
 * Module exports.
 * @public
 */

module.exports = first

/**
 * Get the first event in a set of event emitters and event pairs.
 *
 * @param {array} stuff 须是数组的数组
 * @param {function} done
 * @public
 */

function first (stuff, done) {
  if (!Array.isArray(stuff)) {
    throw new TypeError('arg must be an array of [ee, events...] arrays')
  }

  var cleanups = []

  for (var i = 0; i < stuff.length; i++) {
    var arr = stuff[i]

    // 数组的数组
    if (!Array.isArray(arr) || arr.length < 2) {
      throw new TypeError('each array member must be [ee, events...]')
    }

    var ee = arr[0]

    for (var j = 1; j < arr.length; j++) {
      var event = arr[j] // 事件名
      var fn = listener(event, callback)

      // listen to the event
      // ee 上绑定事件 event
      ee.on(event, fn) // 有任一事件触发，其余事件就会被解绑，也就是只响应最早的那个
      // push this listener to the list of cleanups
      cleanups.push({
        ee: ee,
        event: event,
        fn: fn
      })
    }
  }

  // 事件的回调
  function callback () {
    cleanup() // 事件解绑
    done.apply(null, arguments) // 执行回调
  }

  // 遍历 cleanups 解绑事件
  function cleanup () {
    var x
    for (var i = 0; i < cleanups.length; i++) {
      x = cleanups[i]
      x.ee.removeListener(x.event, x.fn)
    }
  }

  // 提供改写 done 回调函数的方法
  function thunk (fn) {
    done = fn
  }

  // 提供属性 cancel 用于移除所有的事件监听
  thunk.cancel = cleanup

  return thunk
}

/**
 * Create the event listener.
 * @private
 */

function listener (event, done) {
  return function onevent (arg1) {
    var args = new Array(arguments.length)
    var ee = this
    var err = event === 'error'
      ? arg1 // 对 error 事件，取第一个参数为 error
      : null

    // copy args to prevent arguments escaping scope
    for (var i = 0; i < args.length; i++) {
      args[i] = arguments[i]
    }

    done(err, ee, event, args)
  }
}
