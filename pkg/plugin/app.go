package plugin

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/grafana/grafana-plugin-sdk-go/backend/resource/httpadapter"
)

const upstreamEnv = "PIMS_PICHAT_UPSTREAM_URL"

type App struct {
	backend.CallResourceHandler
	upstream *url.URL
	client   *http.Client
}

func NewApp(_ context.Context, _ backend.AppInstanceSettings) (instancemgmt.Instance, error) {
	upstream, err := parseUpstreamURL(os.Getenv(upstreamEnv))
	if err != nil {
		return nil, err
	}
	return newApp(upstream, &http.Client{Timeout: 120 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}), nil
}

func newApp(upstream *url.URL, client *http.Client) *App {
	mux := http.NewServeMux()
	app := &App{upstream: upstream, client: client}
	mux.HandleFunc("/pichat/chat", app.handleChat)
	app.CallResourceHandler = httpadapter.New(mux)
	return app
}

func parseUpstreamURL(raw string) (*url.URL, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return nil, fmt.Errorf("%s is not configured", upstreamEnv)
	}
	u, err := url.ParseRequestURI(value)
	if err != nil || u.Scheme == "" || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return nil, fmt.Errorf("%s must be an http or https origin", upstreamEnv)
	}
	return u, nil
}

func (a *App) chatURL() string { return strings.TrimRight(a.upstream.String(), "/") + "/chat" }
