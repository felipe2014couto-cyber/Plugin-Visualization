package plugin

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

func testApp(t *testing.T, upstream string, client *http.Client) *App {
	t.Helper()
	u, err := url.Parse(upstream)
	if err != nil {
		t.Fatal(err)
	}
	return &App{upstream: u, client: client}
}

func authenticatedRequest(method, path, body string, user *backend.User) *http.Request {
	ctx := backend.WithPluginContext(context.Background(), backend.PluginContext{User: user})
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	return req.WithContext(ctx)
}

func callChat(app *App, req *http.Request) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	app.handleChat(recorder, req)
	return recorder
}

func TestChatSuccessUsesGrafanaIdentityAndReturnsSafeFields(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/chat" || r.Method != http.MethodPost {
			t.Errorf("unexpected upstream request: %s %s", r.Method, r.URL.Path)
		}
		var request chatRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatal(err)
		}
		if request.UserID != "grafana-user" {
			t.Errorf("user id = %q", request.UserID)
		}
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"ok":true,"output":"resposta","tags_consultadas":["TAG"],"tool_name":"pi","agent_trace":["secret"]}`)
	}))
	defer upstream.Close()

	response := callChat(testApp(t, upstream.URL, upstream.Client()), authenticatedRequest(http.MethodPost, "/pichat/chat", `{"message":"oi","user_id":"spoofed","images":[]}`, &backend.User{Login: "grafana-user"}))
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if strings.Contains(response.Body.String(), "agent_trace") {
		t.Fatal("agent trace leaked")
	}
	if !strings.Contains(response.Body.String(), `"tags_consultadas":["TAG"]`) {
		t.Fatal("tags missing")
	}
}

func TestChatRejectsUnknownTargetField(t *testing.T) {
	called := false
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { called = true }))
	defer upstream.Close()
	response := callChat(testApp(t, upstream.URL, upstream.Client()), authenticatedRequest(http.MethodPost, "/pichat/chat", `{"message":"oi","targetUrl":"http://evil"}`, &backend.User{Login: "user"}))
	if response.Code != http.StatusBadRequest || called {
		t.Fatalf("status=%d called=%v", response.Code, called)
	}
	if strings.Contains(response.Body.String(), "evil") {
		t.Fatal("target leaked")
	}
}

func TestChatDoesNotForwardSensitiveHeaders(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		for _, header := range []string{"Authorization", "Cookie", "Set-Cookie", "X-Grafana-User", "Proxy-Authorization"} {
			if r.Header.Get(header) != "" {
				t.Errorf("forwarded %s", header)
			}
		}
		io.WriteString(w, `{"ok":true,"output":"ok"}`)
	}))
	defer upstream.Close()
	req := authenticatedRequest(http.MethodPost, "/pichat/chat", `{"message":"oi"}`, &backend.User{Login: "user"})
	req.Header.Set("Authorization", "secret")
	req.Header.Set("Cookie", "session=secret")
	if response := callChat(testApp(t, upstream.URL, upstream.Client()), req); response.Code != http.StatusOK {
		t.Fatalf("status = %d", response.Code)
	}
}

func TestChatSanitizesUpstreamErrorsAndRedirects(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		io.WriteString(w, `{"detail":"password at 10.0.0.1"}`)
	}))
	response := callChat(testApp(t, upstream.URL, upstream.Client()), authenticatedRequest(http.MethodPost, "/pichat/chat", `{"message":"oi"}`, &backend.User{Login: "user"}))
	upstream.Close()
	if response.Code != http.StatusBadGateway || strings.Contains(response.Body.String(), "password") || strings.Contains(response.Body.String(), "10.0.0.1") {
		t.Fatalf("unsanitized response: %s", response.Body.String())
	}

	redirectTarget := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "http://evil.invalid/chat", http.StatusFound)
	}))
	defer redirectTarget.Close()
	noRedirectClient := redirectTarget.Client()
	noRedirectClient.CheckRedirect = func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }
	response = callChat(testApp(t, redirectTarget.URL, noRedirectClient), authenticatedRequest(http.MethodPost, "/pichat/chat", `{"message":"oi"}`, &backend.User{Login: "user"}))
	if response.Code != http.StatusBadGateway || strings.Contains(response.Body.String(), "evil.invalid") {
		t.Fatalf("redirect leaked: %s", response.Body.String())
	}
}

func TestChatRejectsLargeBodyAndUnauthenticatedRequests(t *testing.T) {
	large := `{"message":"` + strings.Repeat("x", maxPiChatRequestBody) + `"}`
	response := callChat(testApp(t, "http://127.0.0.1:1", http.DefaultClient), authenticatedRequest(http.MethodPost, "/pichat/chat", large, &backend.User{Login: "user"}))
	if response.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("large status = %d", response.Code)
	}
	response = callChat(testApp(t, "http://127.0.0.1:1", http.DefaultClient), authenticatedRequest(http.MethodPost, "/pichat/chat", `{}`, nil))
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("unauth status = %d", response.Code)
	}
	response = callChat(testApp(t, "http://127.0.0.1:1", http.DefaultClient), authenticatedRequest(http.MethodGet, "/pichat/chat", ``, &backend.User{Login: "user"}))
	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("method status = %d", response.Code)
	}
}

func TestChatTimeoutIsSanitized(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { time.Sleep(100 * time.Millisecond) }))
	defer upstream.Close()
	client := &http.Client{Timeout: 10 * time.Millisecond, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}
	response := callChat(testApp(t, upstream.URL, client), authenticatedRequest(http.MethodPost, "/pichat/chat", `{"message":"oi"}`, &backend.User{Login: "user"}))
	if response.Code != http.StatusBadGateway || strings.Contains(response.Body.String(), "timeout") && strings.Contains(response.Body.String(), "10ms") {
		t.Fatalf("timeout leaked: %s", response.Body.String())
	}
}

func TestChatRejectsOversizedUpstreamResponseAndUnsafeConfiguredURL(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, strings.Repeat("x", maxPiChatResponseBody+1))
	}))
	defer upstream.Close()
	response := callChat(testApp(t, upstream.URL, upstream.Client()), authenticatedRequest(http.MethodPost, "/pichat/chat", `{"message":"oi"}`, &backend.User{Login: "user"}))
	if response.Code != http.StatusBadGateway || strings.Contains(response.Body.String(), strings.Repeat("x", 32)) {
		t.Fatalf("oversized response was not sanitized: status=%d body=%s", response.Code, response.Body.String())
	}
	if _, err := parseUpstreamURL("http://safe.example/?target=http://evil.example"); err == nil {
		t.Fatal("query-bearing upstream URL was accepted")
	}
}
