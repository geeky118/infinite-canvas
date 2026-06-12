package handler

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/service"
	"github.com/google/uuid"
)

const canvasImageMaxBytes = 30 << 20

type canvasImageUploadResult struct {
	Key      string `json:"key"`
	URL      string `json:"url"`
	MimeType string `json:"mimeType"`
	Bytes    int64  `json:"bytes"`
}

func UploadCanvasImage(w http.ResponseWriter, r *http.Request) {
	if !isCOSConfigured() {
		Fail(w, "未配置腾讯云 COS，无法保存图片到云端")
		return
	}
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, canvasImageMaxBytes+1)
	if err := r.ParseMultipartForm(canvasImageMaxBytes); err != nil {
		Fail(w, "图片过大或上传格式不正确")
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		Fail(w, "请上传图片")
		return
	}
	defer file.Close()

	mimeType, ext, ok := normalizeReferenceMediaType(header.Header.Get("Content-Type"), filepath.Ext(header.Filename))
	if !ok || !strings.HasPrefix(mimeType, "image/") {
		Fail(w, "图片格式不支持，请使用 jpeg/png/webp/bmp/gif/heic/heif 图片")
		return
	}
	body, err := io.ReadAll(io.LimitReader(file, canvasImageMaxBytes+1))
	if err != nil || len(body) == 0 {
		Fail(w, "图片读取失败")
		return
	}
	if len(body) > canvasImageMaxBytes {
		Fail(w, "图片超过大小限制，请使用 30MB 以内的图片")
		return
	}
	key := fmt.Sprintf("infinite-canvas/images/%s/%s%s", user.ID, uuid.NewString(), ext)
	if err := putCOSObject(key, mimeType, body); err != nil {
		Fail(w, "图片保存到 COS 失败")
		return
	}
	OK(w, canvasImageUploadResult{Key: key, URL: cosPublicURL(key), MimeType: mimeType, Bytes: int64(len(body))})
}

func isCOSConfigured() bool {
	return strings.TrimSpace(config.Cfg.TencentCOSSecretID) != "" &&
		strings.TrimSpace(config.Cfg.TencentCOSSecretKey) != "" &&
		strings.TrimSpace(config.Cfg.TencentCOSBucket) != "" &&
		strings.TrimSpace(config.Cfg.TencentCOSRegion) != ""
}

func putCOSObject(key string, mimeType string, body []byte) error {
	escapedKey := "/" + strings.TrimLeft(key, "/")
	endpoint := fmt.Sprintf("https://%s.cos.%s.myqcloud.com%s", strings.TrimSpace(config.Cfg.TencentCOSBucket), strings.TrimSpace(config.Cfg.TencentCOSRegion), cosEncodePath(escapedKey))
	request, err := http.NewRequest(http.MethodPut, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", mimeType)
	request.Header.Set("Host", request.URL.Host)
	request.ContentLength = int64(len(body))
	request.Header.Set("Authorization", cosAuthorization(http.MethodPut, escapedKey, request.URL.RawQuery, request.Header))
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode >= http.StatusBadRequest {
		return fmt.Errorf("cos upload failed: %d", response.StatusCode)
	}
	return nil
}

func cosAuthorization(method string, path string, rawQuery string, header http.Header) string {
	now := time.Now().Unix()
	keyTime := fmt.Sprintf("%d;%d", now-60, now+600)
	httpString := strings.ToLower(method) + "\n" + cosEncodePath(path) + "\n" + cosFormatQuery(rawQuery) + "\n" + cosFormatHeaders(header) + "\n"
	signKey := hmacSHA1Hex(strings.TrimSpace(config.Cfg.TencentCOSSecretKey), keyTime)
	stringToSign := "sha1\n" + keyTime + "\n" + sha1Hex(httpString) + "\n"
	signature := hmacSHA1Hex(signKey, stringToSign)
	return fmt.Sprintf("q-sign-algorithm=sha1&q-ak=%s&q-sign-time=%s&q-key-time=%s&q-header-list=%s&q-url-param-list=%s&q-signature=%s", strings.TrimSpace(config.Cfg.TencentCOSSecretID), keyTime, keyTime, cosHeaderList(header), cosQueryList(rawQuery), signature)
}

func cosFormatHeaders(header http.Header) string {
	keys := cosHeaderKeys(header)
	values := make([]string, 0, len(keys))
	for _, key := range keys {
		values = append(values, key+"="+url.QueryEscape(strings.ToLower(strings.Join(header.Values(http.CanonicalHeaderKey(key)), ","))))
	}
	return strings.Join(values, "&")
}

func cosHeaderList(header http.Header) string {
	return strings.Join(cosHeaderKeys(header), ";")
}

func cosHeaderKeys(header http.Header) []string {
	keys := make([]string, 0, len(header))
	for key := range header {
		keys = append(keys, strings.ToLower(key))
	}
	sort.Strings(keys)
	return keys
}

func cosFormatQuery(rawQuery string) string {
	values, _ := url.ParseQuery(rawQuery)
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, strings.ToLower(key))
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		parts = append(parts, key+"="+url.QueryEscape(strings.ToLower(strings.Join(values[key], ","))))
	}
	return strings.Join(parts, "&")
}

func cosQueryList(rawQuery string) string {
	values, _ := url.ParseQuery(rawQuery)
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, strings.ToLower(key))
	}
	sort.Strings(keys)
	return strings.Join(keys, ";")
}

func cosEncodePath(path string) string {
	parts := strings.Split(path, "/")
	for i, part := range parts {
		parts[i] = url.PathEscape(part)
	}
	return strings.Join(parts, "/")
}

func cosPublicURL(key string) string {
	cdnDomain := strings.TrimRight(strings.TrimSpace(config.Cfg.TencentCOSCDNDomain), "/")
	if cdnDomain != "" {
		return cdnDomain + "/" + strings.TrimLeft(key, "/")
	}
	return fmt.Sprintf("https://%s.cos.%s.myqcloud.com/%s", strings.TrimSpace(config.Cfg.TencentCOSBucket), strings.TrimSpace(config.Cfg.TencentCOSRegion), strings.TrimLeft(key, "/"))
}

func sha1Hex(value string) string {
	sum := sha1.Sum([]byte(value))
	return hex.EncodeToString(sum[:])
}

func hmacSHA1Hex(key string, value string) string {
	mac := hmac.New(sha1.New, []byte(key))
	_, _ = mac.Write([]byte(value))
	return hex.EncodeToString(mac.Sum(nil))
}
