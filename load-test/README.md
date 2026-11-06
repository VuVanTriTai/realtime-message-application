# Load Test — Realtime Messaging Application

Bộ kiểm tra hiệu năng toàn diện dùng **k6** + **Prometheus** + **Grafana**.

## Cấu trúc thư mục

```
load-test/
├── docker-compose.observability.yml   # Prometheus + Grafana
├── prometheus/
│   └── prometheus.yml                 # Scrape config
├── grafana/
│   ├── dashboards/
│   │   └── chat-load-test.json        # Dashboard tự động load
│   └── provisioning/
│       ├── datasources/prometheus.yml
│       └── dashboards/dashboards.yml
└── scripts/
    ├── stomp-helper.js                # Thư viện STOMP dùng chung
    ├── auth-helper.js                 # Login + API helpers
    ├── 01_connection_hold.js          # Kịch bản 1: Giữ kết nối
    ├── 02_direct_message.js           # Kịch bản 2: Tin nhắn 1-1
    ├── 03_large_group.js              # Kịch bản 3: Nhóm lớn + fanout
    ├── 04_mix_realistic.js            # Kịch bản 4: Mix thực tế
    ├── 05_reconnect_storm.js          # Kịch bản 5: Reconnect storm
    ├── 06_slow_consumer.js            # Kịch bản 6: Slow consumer
    ├── 07_soak_test.js                # Kịch bản 7: Soak 90 phút
    └── 08_spike.js                    # Kịch bản 8: Spike 5x
```

## Dữ liệu Test (Seed)

Migration `V6__load_test_seed.sql` tạo:
- **200 user**: `testuser001`..`testuser200`, password: `LoadTest@123`
- **LargeGroup**: nhóm 200 thành viên + 500 tin nhắn mẫu
- **100 cuộc trò chuyện 1-1**: các cặp liên tiếp (001↔002, 003↔004, ...)
- **200 tin nhắn** trong cặp `testuser001 ↔ testuser002`

## Hướng Dẫn Chạy

### Bước 1: Khởi động observability stack

```bash
cd load-test
docker compose -f docker-compose.observability.yml up -d
```

- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (admin / admin)

### Bước 2: Chạy Spring Boot app

```bash
# Từ thư mục gốc
./mvnw spring-boot:run
```

Kiểm tra metrics: http://localhost:8080/actuator/prometheus

### Bước 3: Cài k6

```bash
# Windows (winget)
winget install k6 --source winget

# Hoặc download từ https://k6.io/docs/get-started/installation/
```

### Bước 4: Chạy từng kịch bản

```bash
# Kịch bản 1: Giữ kết nối (1K→15K, 28 phút)
k6 run load-test/scripts/01_connection_hold.js

# Kịch bản 2: Tin nhắn 1-1 (10 phút)
k6 run load-test/scripts/02_direct_message.js

# Kịch bản 3: Nhóm lớn (cần GROUP_ID từ DB)
k6 run -e GROUP_ID=1 load-test/scripts/03_large_group.js

# Kịch bản 4: Mix thực tế (12 phút)
k6 run load-test/scripts/04_mix_realistic.js

# Kịch bản 5: Reconnect storm (12 phút)
k6 run load-test/scripts/05_reconnect_storm.js

# Kịch bản 6: Slow consumer (10 phút)
k6 run load-test/scripts/06_slow_consumer.js

# Kịch bản 7: Soak test (90 phút — chạy qua đêm)
k6 run load-test/scripts/07_soak_test.js

# Kịch bản 8: Spike 5x (9 phút)
k6 run load-test/scripts/08_spike.js
```

### Chạy với output HTML report

```bash
k6 run --out json=results.json load-test/scripts/04_mix_realistic.js
```

## Chỉ Số Cần Theo Dõi (Grafana)

| Panel | Ngưỡng bình thường |
|---|---|
| **WS Sessions Active** | Tăng tuyến tính với VU |
| **Messages/second** | Tỷ lệ với active senders |
| **P50 latency** | < 100ms |
| **P95 latency** | < 300ms (baseline), < 500ms (spike) |
| **P99 latency** | < 1000ms |
| **JVM Heap** | Không tăng vô hạn (soak test) |
| **GC pause** | < 100ms/s tổng |
| **STOMP Inbound Active** | < 50 (tránh bão hòa max=64) |
| **HikariCP Active** | < 25 (tránh bão hòa max=30) |
| **CPU %** | < 70% ở tải bình thường |

## Lấy GROUP_ID

```sql
SELECT id FROM conversations WHERE type = 'GROUP' AND name = 'LargeGroup';
```

## Lưu Ý

- **Kịch bản 1 (15K connections)**: Cần nâng ulimit trên máy test:
  ```bash
  ulimit -n 65536
  ```
- **Windows**: Chỉnh `max connections` ở HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters
- **Soak test (07)**: Chạy với `k6 run --no-vu-connection-reuse` để tránh pool cache
- k6 mặc định 1 VU = 1 goroutine nhẹ (không phải thread) → có thể chạy 15K VU trên máy 16GB RAM
