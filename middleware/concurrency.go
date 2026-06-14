package middleware

import (
	"github.com/basketikun/infinite-canvas/handler"
	"github.com/basketikun/infinite-canvas/service"
	"github.com/gin-gonic/gin"
)

// ConcurrencyLimit 必须在 UserAuth 之后使用，从 context 中读取已认证用户。
func ConcurrencyLimit(c *gin.Context) {
	user, ok := service.UserFromContext(c.Request.Context())
	if !ok {
		c.Next()
		return
	}
	if !service.AcquireConcurrent(user.ID) {
		handler.Fail(c.Writer, "当前并发请求过多，请稍后再试")
		c.Abort()
		return
	}
	defer service.ReleaseConcurrent(user.ID)
	c.Next()
}
