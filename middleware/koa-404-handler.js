const koa404Handler = async (ctx, next) => {
    try {
        await next();
        if (ctx.status === 404) ctx.throw(404); // 检查状态，抛出错误
    } catch (err) {
        ctx.throw(err);
        ctx.app.emit('error', err, ctx);
    }
};

module.exports = koa404Handler;
