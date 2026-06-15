package handler

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime"
	"mime/multipart"
	"net/http"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

func AIImagesGenerations(w http.ResponseWriter, r *http.Request) {
	proxyAIRequest(w, r, "/images/generations")
}

func AIImagesEdits(w http.ResponseWriter, r *http.Request) {
	proxyAIRequest(w, r, "/images/edits")
}

func AIChatCompletions(w http.ResponseWriter, r *http.Request) {
	proxyAIRequest(w, r, "/chat/completions")
}

func AIAudioSpeech(w http.ResponseWriter, r *http.Request) {
	body, contentType, modelName, err := readAIRequest(r)
	if err != nil {
		log.Printf("AI proxy request read failed: %v", err)
		Fail(w, "AI 接口请求失败")
		return
	}
	if channel, err := service.SelectModelChannel(modelName); err == nil && isXiaomiChannel(channel.BaseURL) {
		xiaomiAudioSpeech(w, r, body, modelName, channel)
		return
	}
	proxyAIRequestCore(w, r, body, contentType, modelName, "/audio/speech")
}

func AIVideos(w http.ResponseWriter, r *http.Request) {
	proxyAIRequest(w, r, "/videos")
}

func AIVideo(w http.ResponseWriter, r *http.Request, id string) {
	proxyAIGetRequest(w, r, "/videos/"+id)
}

func AIVideoContent(w http.ResponseWriter, r *http.Request, id string) {
	proxyAIGetRequest(w, r, "/videos/"+id+"/content")
}

func proxyAIGetRequest(w http.ResponseWriter, r *http.Request, path string) {
	modelName := r.URL.Query().Get("model")
	if strings.TrimSpace(modelName) == "" {
		modelName = "grok-imagine-video"
	}
	channel, err := service.SelectModelChannel(modelName)
	if err != nil {
		log.Printf("AI proxy select channel failed: model=%s err=%v", modelName, err)
		Fail(w, "AI 接口请求失败")
		return
	}
	path = resolveAIProxyPath(channel.BaseURL, modelName, path)
	request, err := http.NewRequest(http.MethodGet, service.BuildModelChannelURL(channel, path), nil)
	if err != nil {
		Fail(w, "AI 接口请求失败")
		return
	}
	request.Header.Set("Authorization", "Bearer "+channel.APIKey)
	copyAIResponse(w, request, nil)
}

func proxyAIRequest(w http.ResponseWriter, r *http.Request, path string) {
	body, contentType, modelName, err := readAIRequest(r)
	if err != nil {
		log.Printf("AI proxy request read failed: %v", err)
		Fail(w, "AI 接口请求失败")
		return
	}
	proxyAIRequestCore(w, r, body, contentType, modelName, path)
}

func proxyAIRequestCore(w http.ResponseWriter, r *http.Request, body []byte, contentType string, modelName string, path string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	credits, err := service.ModelCost(modelName)
	if err != nil {
		log.Printf("AI proxy read model cost failed: model=%s err=%v", modelName, err)
		Fail(w, "AI 接口请求失败")
		return
	}
	credits *= readAIRequestCount(body, contentType)
	channel, err := service.SelectModelChannel(modelName)
	if err != nil {
		log.Printf("AI proxy select channel failed: model=%s err=%v", modelName, err)
		Fail(w, "AI 接口请求失败")
		return
	}
	path = resolveAIProxyPath(channel.BaseURL, modelName, path)
	request, err := http.NewRequest(http.MethodPost, service.BuildModelChannelURL(channel, path), bytes.NewReader(body))
	if err != nil {
		log.Printf("AI proxy build request failed: url=%s err=%v", service.BuildModelChannelURL(channel, path), err)
		Fail(w, "AI 接口请求失败")
		return
	}
	request.Header.Set("Authorization", "Bearer "+channel.APIKey)
	if contentType != "" {
		request.Header.Set("Content-Type", contentType)
	}
	if err := service.ConsumeUserCredits(user.ID, modelName, credits, path); err != nil {
		FailError(w, err)
		return
	}
	copyAIResponse(w, request, func() {
		if err := service.RefundUserCredits(user.ID, modelName, credits, path); err != nil {
			log.Printf("AI proxy refund credits failed: user=%s model=%s credits=%d err=%v", user.ID, modelName, credits, err)
		}
	})
}

func copyAIResponse(w http.ResponseWriter, request *http.Request, onFailure func()) {
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		log.Printf("AI proxy request failed: url=%s err=%v", request.URL.String(), err)
		if onFailure != nil {
			onFailure()
		}
		Fail(w, "AI 接口请求失败")
		return
	}
	defer response.Body.Close()

	if response.StatusCode >= http.StatusBadRequest {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		log.Printf("AI upstream error: url=%s status=%d", request.URL.String(), response.StatusCode)
		if onFailure != nil {
			onFailure()
		}
		Fail(w, aiUpstreamStatusMessage(response.StatusCode, body))
		return
	}

	for key, values := range response.Header {
		if strings.EqualFold(key, "Content-Length") {
			continue
		}
		for _, value := range values {
			w.Header().Add(key, value)
		}
	}
	w.WriteHeader(response.StatusCode)
	_, _ = io.Copy(w, response.Body)
}

func readAIRequest(r *http.Request) ([]byte, string, string, error) {
	contentType := r.Header.Get("Content-Type")
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return nil, "", "", err
	}
	modelName := ""
	if strings.HasPrefix(contentType, "multipart/form-data") {
		modelName = readMultipartModel(body, contentType)
	} else {
		var payload struct {
			Model string `json:"model"`
		}
		_ = json.Unmarshal(body, &payload)
		modelName = payload.Model
	}
	if strings.TrimSpace(modelName) == "" {
		return nil, "", "", errMissingModel
	}
	return body, contentType, modelName, nil
}

func readMultipartModel(body []byte, contentType string) string {
	_, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		return ""
	}
	reader := multipart.NewReader(bytes.NewReader(body), params["boundary"])
	form, err := reader.ReadForm(32 << 20)
	if err != nil {
		return ""
	}
	defer form.RemoveAll()
	if values := form.Value["model"]; len(values) > 0 {
		return values[0]
	}
	return ""
}

func readAIRequestCount(body []byte, contentType string) int {
	count := 1
	if strings.HasPrefix(contentType, "multipart/form-data") {
		_, params, err := mime.ParseMediaType(contentType)
		if err != nil {
			return count
		}
		form, err := multipart.NewReader(bytes.NewReader(body), params["boundary"]).ReadForm(32 << 20)
		if err != nil {
			return count
		}
		defer form.RemoveAll()
		if values := form.Value["n"]; len(values) > 0 {
			_, _ = fmt.Sscan(values[0], &count)
		}
	} else {
		var payload struct {
			N int `json:"n"`
		}
		_ = json.Unmarshal(body, &payload)
		count = payload.N
	}
	if count < 1 {
		return 1
	}
	return count
}

var errMissingModel = &aiError{"缺少模型名称"}

func resolveAIProxyPath(baseURL string, modelName string, path string) string {
	if isGrokOpenAIVideo(modelName) || !isArkSeedanceVideo(baseURL, modelName) {
		return path
	}
	if path == "/videos" {
		return "/contents/generations/tasks"
	}
	if strings.HasPrefix(path, "/videos/") && !strings.HasSuffix(path, "/content") {
		return "/contents/generations/tasks/" + strings.TrimPrefix(path, "/videos/")
	}
	return path
}

func isArkSeedanceVideo(baseURL string, modelName string) bool {
	base := strings.ToLower(baseURL)
	model := strings.ToLower(modelName)
	return strings.Contains(model, "seedance") || strings.Contains(model, "doubao-seedance") || strings.Contains(base, "/api/plan/v3")
}

func isGrokOpenAIVideo(modelName string) bool {
	model := strings.ToLower(strings.TrimSpace(modelName))
	return model == "grok-imagine-video" || model == "grok-imagine-1.0-video"
}

func isXiaomiChannel(baseURL string) bool {
	return strings.Contains(strings.ToLower(baseURL), "xiaomimimo.com")
}

func xiaomiAudioSpeech(w http.ResponseWriter, r *http.Request, originalBody []byte, modelName string, channel model.ModelChannel) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var payload struct {
		Model         string  `json:"model"`
		Input         string  `json:"input"`
		Voice         string  `json:"voice"`
		ResponseFormat string  `json:"response_format"`
		Speed         float64 `json:"speed"`
		Instructions  string  `json:"instructions"`
	}
	if err := json.Unmarshal(originalBody, &payload); err != nil || strings.TrimSpace(payload.Input) == "" {
		Fail(w, "缺少待朗读的文本")
		return
	}
	if payload.Model == "" {
		payload.Model = modelName
	}

	credits, err := service.ModelCost(payload.Model)
	if err != nil {
		log.Printf("AI proxy read model cost failed: model=%s err=%v", payload.Model, err)
		Fail(w, "AI 接口请求失败")
		return
	}

	if err := service.ConsumeUserCredits(user.ID, payload.Model, credits, "/audio/speech"); err != nil {
		FailError(w, err)
		return
	}

	chatBody := map[string]any{
		"model": payload.Model,
		"messages": []map[string]string{
			{"role": "user", "content": "read aloud"},
			{"role": "assistant", "content": payload.Input},
		},
		"modalities": []string{"text", "audio"},
		"audio": map[string]any{
			"voice":  payload.Voice,
			"format": payload.ResponseFormat,
		},
	}
	if payload.Speed > 0 {
		chatBody["audio"].(map[string]any)["speed"] = payload.Speed
	}

	chatJSON, err := json.Marshal(chatBody)
	if err != nil {
		service.RefundUserCredits(user.ID, payload.Model, credits, "/audio/speech")
		Fail(w, "AI 接口请求失败")
		return
	}

	url := service.BuildModelChannelURL(channel, "/chat/completions")
	log.Printf("Xiaomi TTS request: url=%s model=%s voice=%s format=%s speed=%.2f", url, payload.Model, payload.Voice, payload.ResponseFormat, payload.Speed)
	request, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(chatJSON))
	if err != nil {
		service.RefundUserCredits(user.ID, payload.Model, credits, "/audio/speech")
		Fail(w, "AI 接口请求失败")
		return
	}
	request.Header.Set("Authorization", "Bearer "+channel.APIKey)
	request.Header.Set("Content-Type", "application/json")

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		service.RefundUserCredits(user.ID, payload.Model, credits, "/audio/speech")
		Fail(w, "AI 接口请求失败")
		return
	}
	defer response.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(response.Body, 32<<20))
	if err != nil {
		log.Printf("Xiaomi TTS read response failed: %v", err)
		service.RefundUserCredits(user.ID, payload.Model, credits, "/audio/speech")
		Fail(w, "AI 接口请求失败")
		return
	}

	log.Printf("Xiaomi TTS response: status=%d body_len=%d", response.StatusCode, len(respBody))
	if response.StatusCode >= http.StatusBadRequest {
		log.Printf("Xiaomi TTS upstream error: %s", string(respBody[:min(len(respBody), 500)]))
		service.RefundUserCredits(user.ID, payload.Model, credits, "/audio/speech")
		Fail(w, aiUpstreamStatusMessage(response.StatusCode, respBody))
		return
	}

	var chatResp struct {
		Choices []struct {
			Message struct {
				Audio struct {
					Data string `json:"data"`
				} `json:"audio"`
			} `json:"message"`
		} `json:"choices"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(respBody, &chatResp); err != nil {
		log.Printf("Xiaomi TTS parse response failed: %v body=%s", err, string(respBody[:min(len(respBody), 300)]))
		service.RefundUserCredits(user.ID, payload.Model, credits, "/audio/speech")
		Fail(w, "AI 接口返回格式异常")
		return
	}
	if chatResp.Error != nil && chatResp.Error.Message != "" {
		service.RefundUserCredits(user.ID, payload.Model, credits, "/audio/speech")
		Fail(w, chatResp.Error.Message)
		return
	}
	if len(chatResp.Choices) == 0 || chatResp.Choices[0].Message.Audio.Data == "" {
		service.RefundUserCredits(user.ID, payload.Model, credits, "/audio/speech")
		Fail(w, "AI 未返回音频数据")
		return
	}

	audioBytes, err := base64.StdEncoding.DecodeString(chatResp.Choices[0].Message.Audio.Data)
	if err != nil {
		service.RefundUserCredits(user.ID, payload.Model, credits, "/audio/speech")
		Fail(w, "音频数据解码失败")
		return
	}

	format := payload.ResponseFormat
	if format == "" {
		format = detectAudioFormat(audioBytes)
	}
	w.Header().Set("Content-Type", audioContentType(format))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(audioBytes)))
	w.WriteHeader(http.StatusOK)
	w.Write(audioBytes)
}

func detectAudioFormat(data []byte) string {
	if len(data) >= 4 && string(data[:4]) == "RIFF" {
		return "wav"
	}
	if len(data) >= 3 && string(data[:3]) == "ID3" {
		return "mp3"
	}
	if len(data) >= 2 && data[0] == 0xff && (data[1]&0xe0) == 0xe0 {
		return "mp3"
	}
	return "mp3"
}

func audioContentType(format string) string {
	switch format {
	case "wav":
		return "audio/wav"
	case "opus":
		return "audio/opus"
	case "aac":
		return "audio/aac"
	case "flac":
		return "audio/flac"
	case "pcm":
		return "audio/pcm"
	default:
		return "audio/mpeg"
	}
}

func aiStatusMessage(statusCode int) string {
	switch statusCode {
	case http.StatusUnauthorized, http.StatusForbidden:
		return "AI 接口鉴权失败，请检查 API Key、套餐权限或模型权限"
	case http.StatusTooManyRequests:
		return "AI 接口限流或额度不足，请稍后重试或检查额度"
	default:
		return "AI 接口请求失败"
	}
}

func aiUpstreamStatusMessage(statusCode int, body []byte) string {
	base := aiStatusMessage(statusCode)
	detail := aiUpstreamErrorDetail(body)
	if detail == "" {
		return base
	}
	return base + "：" + detail
}

func aiUpstreamErrorDetail(body []byte) string {
	text := strings.TrimSpace(string(body))
	if text == "" {
		return ""
	}
	var payload struct {
		Msg     string `json:"msg"`
		Message string `json:"message"`
		Error   struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &payload); err == nil {
		if payload.Error.Message != "" {
			if detail := friendlyUpstreamError(payload.Error.Code, payload.Error.Message); detail != "" {
				return safeUpstreamText(detail)
			}
			if payload.Error.Code != "" {
				return safeUpstreamText(payload.Error.Code + " " + payload.Error.Message)
			}
			return safeUpstreamText(payload.Error.Message)
		}
		if payload.Msg != "" {
			return safeUpstreamText(payload.Msg)
		}
		if payload.Message != "" {
			return safeUpstreamText(payload.Message)
		}
	}
	return safeUpstreamText(text)
}

func friendlyUpstreamError(code string, message string) string {
	lowerCode := strings.ToLower(strings.TrimSpace(code))
	if strings.Contains(lowerCode, "inputvideosensitivecontentdetected") || strings.Contains(lowerCode, "privacyinformation") {
		return strings.TrimSpace(code + " 参考视频疑似包含真人或隐私信息，火山方舟拒绝使用普通 URL 作为真人视频参考；请改用不含真人的视频、官方允许的模型产物，或已授权的 asset:// 素材。原始错误：" + message)
	}
	return ""
}

func safeUpstreamText(text string) string {
	text = strings.Join(strings.Fields(strings.TrimSpace(text)), " ")
	runes := []rune(text)
	if len(runes) > 300 {
		return string(runes[:300]) + "..."
	}
	return text
}

type aiError struct {
	message string
}

func (err *aiError) Error() string {
	return err.message
}
