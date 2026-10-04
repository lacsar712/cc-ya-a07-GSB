# 风机偏航对中台

现场技师登记机组编号与偏航误差（度）；后台 worker 用数据库行锁认领待处理记录，按 ±1.5° 阈值写入「合格」或「偏航超差」。前端为 Lit 组件 + Vite，接口为 Quart + Hypercorn。

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

## 偏航电机过热封锁窗

电机过热时段内该机偏航报送整体上锁。顶栏「偏航电机过热封锁窗」专页：选机组、填起止时刻配置封锁窗，窗卡片下挂该窗的拒收（封锁）日志。

- technician 可配置/删除封锁窗；observer 只能查看，不能配置、删除或报送。
- 落在窗内的报送被**真实拒收**：HTTP 409，`yaw_logs` 不落库，同事务写入一条 `yaw_overheat_blocks` 拒收日志，提示「请移出封锁时段后再报送」。拒收与日志在同一数据库事务内写入，缺一不可（任一失败整体回滚，不会出现“界面可报却实际收下”或“只提示不拦截”）。
- 判定只使用**服务端时钟**：SQL 中以 PostgreSQL `now()` 比对窗的起止时刻，不采信客户端/本机时间。窗状态（active）亦由服务端计算，前端仅据此锁定表单。
- 当前时刻入窗报送失败；出窗后再送成功。

接口：

| 方法与路径 | 权限 | 说明 |
|------|------|------|
| `GET /api/overheat/windows` | 登录 | 封锁窗列表（含服务端 `active`）与全部拒收日志 |
| `POST /api/overheat/windows` | technician | 配置封锁窗（机组、起止时刻） |
| `DELETE /api/overheat/windows/{id}` | technician | 删除封锁窗（下挂拒收日志级联删除） |
| `GET /api/time` | 公开 | 服务端当前时钟（数据库 `now()`） |

## 技术栈

- 后端：Quart、psycopg、`worker.py`（`FOR UPDATE SKIP LOCKED`）、Hypercorn
- 前端：Lit、TypeScript、Vite；生产镜像内 nginx 反代 `/api`
- 镜像源：DaoCloud 基础镜像、清华 PyPI、npmmirror npm
