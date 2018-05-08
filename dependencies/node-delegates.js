
/**
 * Expose `Delegator`.
 */

module.exports = Delegator;

/**
 * Initialize a delegator.
 *
 * @param {Object} proto
 * @param {String} target
 * @api public
 */

function Delegator(proto, target) {
  // 无需显式调用 new，默认会使用 new 来生成实例
  if (!(this instanceof Delegator)) return new Delegator(proto, target);
  this.proto = proto;
  this.target = target;
  this.methods = [];
  this.getters = [];
  this.setters = [];
  this.fluents = [];
}

/**
 * Automatically delegate properties
 * from a target prototype
 *
 * @param {Object} proto
 * @param {object} targetProto
 * @param {String} targetProp
 * @api public
 */

Delegator.auto = function(proto, targetProto, targetProp){
  var delegator = Delegator(proto, targetProp);
  var properties = Object.getOwnPropertyNames(targetProto); // 返回 targetProto 的所有自身属性的属性名
  // 遍历，逐个进行代理
  for (var i = 0; i < properties.length; i++) {
    var property = properties[i];
    var descriptor = Object.getOwnPropertyDescriptor(targetProto, property);
    if (descriptor.get) {
      delegator.getter(property);
    }
    if (descriptor.set) {
      delegator.setter(property);
    }
    // 根据描述符 value 值的不同采用不同的策略
    if (descriptor.hasOwnProperty('value')) { // could be undefined but writable
      var value = descriptor.value;
      if (value instanceof Function) {
        delegator.method(property);
      } else {
        delegator.getter(property);
      }
      if (descriptor.writable) {
        delegator.setter(property);
      }
    }
  }
};

/**
 * Delegate method `name`.
 *
 * @param {String} name
 * @return {Delegator} self
 * @api public
 */

// 在 context 对象上调用名为 name 的方法，会调用被代理对象 target 上的同名方法
Delegator.prototype.method = function(name){
  var proto = this.proto;
  var target = this.target;
  this.methods.push(name); // methods 数组仅保存方法名

  // 在原型对象上添加名为 name 的方法
  proto[name] = function(){
    // 被调用时执行被代理对象上的同名方法并传入参数，执行上下文为被代理对象
    return this[target][name].apply(this[target], arguments);
  };

  return this;
};

/**
 * Delegator accessor `name`.
 *
 * @param {String} name
 * @return {Delegator} self
 * @api public
 */

// 代理名为 name 的属性，此属性可以读写
Delegator.prototype.access = function(name){
  return this.getter(name).setter(name);
};

/**
 * Delegator getter `name`.
 *
 * @param {String} name
 * @return {Delegator} self
 * @api public
 */

// 在 context 对象上访问名为 name 的属性，会返回被代理对象 target 上的同名属性
Delegator.prototype.getter = function(name){
  var proto = this.proto;
  var target = this.target;
  this.getters.push(name);

  // 根据 MDN , __defineGetter__ 已被废弃
  // 可以改写成下面这样：
  // Object.defineProperty(proto, name, {
  //   get() {
  //     return this[target][name];
  //   },
  //   configurable: true
  // }

  proto.__defineGetter__(name, function(){
    return this[target][name];
  });

  return this;
};

/**
 * Delegator setter `name`.
 *
 * @param {String} name
 * @return {Delegator} self
 * @api public
 */

// 在 context 对象上设置名为 name 的属性，会设置被代理对象 target 上的同名属性的值
Delegator.prototype.setter = function(name){
  var proto = this.proto;
  var target = this.target;
  this.setters.push(name);

  // 根据 MDN , __defineSetter__ 已被废弃
  // 可以改写成下面这样：
  // Object.defineProperty(this.proto, name, {
  //   set(v) {
  //     this[target][name] = v;
  //   },
  //   configurable: true
  // });

  proto.__defineSetter__(name, function(val){
    return this[target][name] = val;
  });

  return this;
};

/**
 * Delegator fluent accessor
 *
 * @param {String} name
 * @return {Delegator} self
 * @api public
 */

Delegator.prototype.fluent = function (name) {
  var proto = this.proto;
  var target = this.target;
  this.fluents.push(name);

  // 给了一个值就进行赋值操作，否则进行取值操作
  proto[name] = function(val){
    if ('undefined' != typeof val) {
      this[target][name] = val;
      return this;
    } else {
      return this[target][name];
    }
  };

  return this;
};
