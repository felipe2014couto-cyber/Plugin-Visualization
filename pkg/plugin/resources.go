package plugin

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

const (
	maxPiChatRequestBody  = 8 << 20
	maxPiChatResponseBody = 2 << 20
)

type chatImage struct {
	ImageBase64 string `json:"image_base64"`
	MimeType    string `json:"mime_type"`
	FileName    string `json:"file_name"`
}

type chatRequest struct {
	Message string      `json:"message"`
	UserID  string      `json:"user_id"`
	Images  []chatImage `json:"images"`
}

type upstreamResponse struct {
	OK                    *bool    `json:"ok"`
	Output                string   `json:"output"`
	Answer                string   `json:"answer"`
	Tags                  []string `json:"tags_consultadas"`
	ToolName              string   `json:"tool_name"`
	ErrorCode             string   `json:"error_code"`
	AnswerGenerationError string   `json:"answer_generation_error"`
}

type safeResponse struct {
	OK        bool     `json:"ok"`
	Output    string   `json:"output,omitempty"`
	Tags      []string `json:"tags_consultadas,omitempty"`
	ToolName  string   `json:"tool_name,omitempty"`
	ErrorCode string   `json:"error_code,omitempty"`
}

func (a *App) handleChat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, safeResponse{OK: false, Output: safeMessage("INVALID_REQUEST"), ErrorCode: "INVALID_REQUEST"})
		return
	}
	pluginConfig := backend.PluginConfigFromContext(r.Context())
	if pluginConfig.User == nil || (pluginConfig.User.Login == "" && pluginConfig.User.Name == "") {
		writeJSON(w, http.StatusUnauthorized, safeResponse{OK: false, Output: safeMessage("UNAUTHORIZED"), ErrorCode: "UNAUTHORIZED"})
		return
	}

	request, err := decodeChatRequest(r.Body)
	if err != nil {
		writeJSON(w, requestErrorStatus(err), safeResponse{OK: false, Output: safeMessage(requestErrorCode(err)), ErrorCode: requestErrorCode(err)})
		return
	}
	identity := pluginConfig.User.Login
	if identity == "" {
		identity = pluginConfig.User.Name
	}
	request.UserID = identity
	body, _ := json.Marshal(request)

	ctx, cancel := context.WithTimeout(r.Context(), 120*time.Second)
	defer cancel()
	upstreamRequest, err := http.NewRequestWithContext(ctx, http.MethodPost, a.chatURL(), bytes.NewReader(body))
	if err != nil {
		writeUpstreamError(w, http.StatusBadGateway, "UPSTREAM_ERROR")
		return
	}
	upstreamRequest.Header.Set("Content-Type", "application/json")
	upstreamRequest.Header.Set("Accept", "application/json")
	response, err := a.client.Do(upstreamRequest)
	if err != nil {
		code := "SERVICE_UNAVAILABLE"
		if ctx.Err() == context.DeadlineExceeded || err == context.DeadlineExceeded {
			code = "TIMEOUT"
		}
		logSafe(code, 0)
		writeUpstreamError(w, http.StatusBadGateway, code)
		return
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		logSafe("UPSTREAM_STATUS", response.StatusCode)
		writeUpstreamError(w, safeUpstreamStatus(response.StatusCode), safeCodeForStatus(response.StatusCode))
		return
	}

	responseBody, tooLarge := readLimited(response.Body, maxPiChatResponseBody)
	if tooLarge {
		logSafe("RESPONSE_TOO_LARGE", response.StatusCode)
		writeUpstreamError(w, http.StatusBadGateway, "INVALID_RESPONSE")
		return
	}
	var result upstreamResponse
	if json.Unmarshal(responseBody, &result) != nil {
		logSafe("INVALID_RESPONSE", response.StatusCode)
		writeUpstreamError(w, http.StatusBadGateway, "INVALID_RESPONSE")
		return
	}
	if result.OK != nil && !*result.OK {
		writeUpstreamError(w, http.StatusBadGateway, knownAgentError(result.ErrorCode, result.AnswerGenerationError))
		return
	}
	output := result.Output
	if output == "" {
		output = result.Answer
	}
	if output == "" {
		writeUpstreamError(w, http.StatusBadGateway, "INVALID_RESPONSE")
		return
	}
	writeJSON(w, http.StatusOK, safeResponse{OK: true, Output: output, Tags: result.Tags, ToolName: result.ToolName})
}

func decodeChatRequest(body io.Reader) (chatRequest, error) {
	data, tooLarge := readLimited(body, maxPiChatRequestBody)
	if tooLarge {
		return chatRequest{}, errPayloadTooLarge{}
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var request chatRequest
	if err := decoder.Decode(&request); err != nil {
		return chatRequest{}, errInvalidPayload{}
	}
	var extra interface{}
	if decoder.Decode(&extra) != io.EOF {
		return chatRequest{}, errInvalidPayload{}
	}
	return request, nil
}

type errPayloadTooLarge struct{}

func (errPayloadTooLarge) Error() string { return "payload too large" }

type errInvalidPayload struct{}

func (errInvalidPayload) Error() string { return "invalid payload" }

func requestErrorStatus(err error) int {
	if _, ok := err.(errPayloadTooLarge); ok {
		return http.StatusRequestEntityTooLarge
	}
	return http.StatusBadRequest
}
func requestErrorCode(err error) string {
	if _, ok := err.(errPayloadTooLarge); ok {
		return "PAYLOAD_TOO_LARGE"
	}
	return "INVALID_REQUEST"
}

func readLimited(reader io.Reader, limit int64) ([]byte, bool) {
	data, err := io.ReadAll(io.LimitReader(reader, limit+1))
	return data, err == nil && int64(len(data)) > limit
}

func writeUpstreamError(w http.ResponseWriter, status int, code string) {
	writeJSON(w, status, safeResponse{OK: false, Output: safeMessage(code), ErrorCode: code})
}

func writeJSON(w http.ResponseWriter, status int, value safeResponse) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func safeUpstreamStatus(status int) int {
	return http.StatusBadGateway
}
func safeCodeForStatus(status int) string {
	if status == 401 {
		return "UNAUTHORIZED"
	}
	if status == 403 {
		return "FORBIDDEN"
	}
	if status == 429 {
		return "RATE_LIMITED"
	}
	if status >= 500 {
		return "SERVICE_UNAVAILABLE"
	}
	return "SERVER_ERROR"
}
func knownAgentError(values ...string) string {
	for _, value := range values {
		switch value {
		case "INVALID_REQUEST", "PAYLOAD_TOO_LARGE", "UNSUPPORTED_FILE", "AGENT_ERROR":
			return value
		}
	}
	return "AGENT_ERROR"
}

func safeMessage(code string) string {
	switch code {
	case "UNAUTHORIZED":
		return "Sua sessão não permite acessar o PiChat."
	case "FORBIDDEN":
		return "Você não possui permissão para acessar o PiChat."
	case "RATE_LIMITED":
		return "O PiChat recebeu muitas solicitações. Tente novamente em instantes."
	case "INVALID_REQUEST":
		return "A solicitação do PiChat é inválida."
	case "PAYLOAD_TOO_LARGE":
		return "O conteúdo enviado ao PiChat é muito grande."
	case "TIMEOUT":
		return "O PiChat demorou mais que o esperado para responder. Tente novamente."
	case "INVALID_RESPONSE":
		return "O PiChat retornou uma resposta inválida. Tente novamente."
	case "AGENT_ERROR":
		return "O PiChat não conseguiu processar sua solicitação. Tente reformular a pergunta ou tente novamente."
	default:
		return "O PiChat está temporariamente indisponível. Tente novamente."
	}
}

func logSafe(code string, status int) { log.Printf("component=pichat code=%s status=%d", code, status) }
