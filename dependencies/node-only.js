// 取出 obj 包含键 keys 的子集对象
module.exports = function(obj, keys){
  obj = obj || {};
  // 传入的 keys 值可以是一个使用空格分隔的字符串，会被解析成键数组
  if ('string' == typeof keys) keys = keys.split(/ +/);
  return keys.reduce(function(ret, key){
    if (null == obj[key]) return ret;
    // 每次归并 key 在 obj 中对应的值到 ret[key]
    ret[key] = obj[key];
    return ret;
  }, {}); // 初始传入 {}
};
