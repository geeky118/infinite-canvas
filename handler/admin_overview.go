package handler

import (
	"net/http"

	"github.com/basketikun/infinite-canvas/service"
)

func AdminOverview(w http.ResponseWriter, r *http.Request) {
	overview, err := service.AdminOverview(0, 0, nil)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, overview)
}
