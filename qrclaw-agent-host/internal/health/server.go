package health

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"time"
)

const DefaultPort = 19515

// Snapshot is returned by GET /health (Multica-compatible shape).
type Snapshot struct {
	Status     string   `json:"status"`
	PID        int      `json:"pid"`
	Uptime     string   `json:"uptime"`
	HostID     string   `json:"host_id"`
	ServerURL  string   `json:"server_url"`
	Agents     []string `json:"agents"`
	CLIVersion string   `json:"cli_version"`
}

// Server exposes local daemon health for Desktop/Web proxy (127.0.0.1 only).
type Server struct {
	port      int
	startedAt time.Time
	hostID    string
	serverURL string
	version   string
	agentsFn  func() []string
}

func New(port int, hostID, serverURL, version string, agentsFn func() []string) *Server {
	if port <= 0 {
		port = DefaultPort
	}
	return &Server{
		port:      port,
		startedAt: time.Now(),
		hostID:    hostID,
		serverURL: serverURL,
		version:   version,
		agentsFn:  agentsFn,
	}
}

func (s *Server) ListenAndServe(ctx context.Context) error {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		agents := []string{}
		if s.agentsFn != nil {
			agents = s.agentsFn()
		}
		resp := Snapshot{
			Status:     "running",
			PID:        os.Getpid(),
			Uptime:     time.Since(s.startedAt).Truncate(time.Second).String(),
			HostID:     s.hostID,
			ServerURL:  s.serverURL,
			Agents:     agents,
			CLIVersion: s.version,
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	})

	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", s.port))
	if err != nil {
		return err
	}
	srv := &http.Server{Handler: mux}
	go func() {
		<-ctx.Done()
		shCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = srv.Shutdown(shCtx)
	}()
	return srv.Serve(ln)
}

// Probe returns health JSON map or nil if daemon is not running.
func Probe(ctx context.Context, port int) (map[string]any, error) {
	if port <= 0 {
		port = DefaultPort
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("http://127.0.0.1:%d/health", port), nil)
	if err != nil {
		return nil, err
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("health status %d", res.StatusCode)
	}
	var out map[string]any
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return nil, err
	}
	return out, nil
}
