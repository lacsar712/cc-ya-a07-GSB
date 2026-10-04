# 风机偏航对中台

现场技师登记机组编号与偏航误差（度）；后台 worker 用数据库行锁认领待处理记录，按 ±1.5° 阈值写入「合格」或「偏航超差」。前端为 Lit 组件 + Vite，接口为 Quart + Hypercorn。

## 偏航电机过热封锁窗

电机过热时段内该机偏航报送整体上锁。顶栏「偏航电机过热封锁窗」专页：技师选机组、填起止时刻配置封锁窗，页内下挂封锁日志。

- 报送时刻落在该机任一封锁窗内时，`POST /api/logs` 返回 409 并提示移出窗外再报送；窗结束后再报送正常收下。
- 入窗判定只认数据库服务端时钟（`now()`），客户端报送的时间字段一律无效。
- 封锁日志与真实拒收在同一事务写入：日志写不进去则整体回滚，不会只拒不留痕。
- observer 可查看封锁窗与封锁日志，配置接口对其返回 403。

### 接口

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | /api/lockout-windows | 登录 | 封锁窗列表 |
| POST | /api/lockout-windows | 技师 | 配置封锁窗：`turbine_code`、`start_at`、`end_at`（ISO 时间）、`reason`（可选） |
| GET | /api/lockout-logs | 登录 | 封锁日志（被拦截的报送） |

## 端口

| 服务 | 地址 |
|------|------|
| 页面 | http://localhost:3199 |
| 接口 | http://localhost:8199 |
| PostgreSQL | localhost:54399（库名 `yawalign`） |

## 账号

| 用户 | 密码 | 权限 |
|------|------|------|
| technician | tech123456 | 可提交 |
| observer | obs123456 | 只读 |

## 启动

```bash
cd projects/20-yaw-align-log
docker compose up --build
```

健康检查：`GET http://localhost:8199/api/health` → `{"status":"ok","service":"yaw-align-log"}`。

## 验收

1. 种子数据：机组 W01 误差 0.4° 结论「合格」；机组 W07 误差 3.2° 结论「偏航超差」。
2. technician 提交新记录后，列表先显示「待处理」，数秒内 worker 处理后变为对应结论。
3. observer 可查看列表，无提交表单。
4. technician 配置覆盖当前时刻的封锁窗后，报送该机记录返回 409 并提示移出窗外再报送，封锁日志同步新增一条且对中记录不增；窗结束后再报送该机成功。
5. observer 打开封锁窗专页可查看封锁窗与封锁日志，无配置表单；直接 `POST /api/lockout-windows` 返回 403。

## 技术栈

- 后端：Quart、psycopg、`worker.py`（`FOR UPDATE SKIP LOCKED`）、Hypercorn
- 前端：Lit、TypeScript、Vite；生产镜像内 nginx 反代 `/api`
- 镜像源：DaoCloud 基础镜像、清华 PyPI、npmmirror npm
