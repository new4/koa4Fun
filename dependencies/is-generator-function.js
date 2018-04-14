'use strict';

var toStr = Object.prototype.toString;
var fnToStr = Function.prototype.toString;
var isFnRegex = /^\s*(?:function)?\*/; // 匹配 'function*'
var hasToStringTag = typeof Symbol === 'function' && typeof Symbol.toStringTag === 'symbol';
var getProto = Object.getPrototypeOf;
var getGeneratorFunc = function () { // eslint-disable-line consistent-return
	if (!hasToStringTag) {
		return false;
	}
	try {
		// 自己构造一个 generator 函数用来比较
		return Function('return function*() {}')();
	} catch (e) {
	}
};
var generatorFunc = getGeneratorFunc();
var GeneratorFunction = generatorFunc ? getProto(generatorFunc) : {};

module.exports = function isGeneratorFunction(fn) {
	// 检查 fn 是否是函数
	if (typeof fn !== 'function') {
		return false;
	}
	// 函数 fn 源码字符串，写成 function* 的就是 generator 了
	if (isFnRegex.test(fnToStr.call(fn))) {
		return true;
	}
	// 没有 Symbol 的环境（es6），使用传统的 Object.prototype.toString 来检查对象特性字符串是否是 [object GeneratorFunction]
	if (!hasToStringTag) {
		var str = toStr.call(fn);
		return str === '[object GeneratorFunction]';
	}
	// 有 Symbol 的环境(es6)，使用 Object.getPrototypeOf 读取 fn 对象的原型对象来进行比较
	return getProto(fn) === GeneratorFunction;
};
