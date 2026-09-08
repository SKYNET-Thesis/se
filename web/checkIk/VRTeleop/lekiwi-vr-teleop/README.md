# lekiwi-vr-teleop

Телеуправление роботом **LeKiwi** (рука SO-101 + омни-база на трёх колёсах) из шлема
**Meta Quest** через WebXR. Страница открывается в штатном браузере Quest — ни APK, ни
Unity, ни Android SDK не нужны.

Рука ведётся позой контроллера через замкнутую кинематику SO-101, база — стиком. Рук может
быть одна (LeKiwi) или две (XLeRobot и подобные) — один контроллер целиком обслуживает одну
руку, так что вторая рука стоит одного флага `--arms`. Видео с
камер робота и телеметрия показываются панелями прямо в шлеме, а под ними — 3D-скелет руки
в двух экземплярах: где рука есть и куда ей скомандовано. Зазор между скелетами и есть
отставание сервоприводов, видимое глазом.

```
Quest Browser (WebXR)
      │  позы контроллеров, кнопки           ▲  MJPEG камер + телеметрия
      ▼  WebSocket                           │
   relay (aiohttp, фоновый поток)
      │
      ▼
   цикл 30 Гц ─── рука: клатч → оси кисти → замкнутая кинематика → два лимита
      │       └── база: стик → x.vel / y.vel / theta.vel
      ▼
   LeKiwiClient ──ZMQ──> host на Raspberry Pi ──> SO-101 + 3 колеса
```

## Phone Teleop

The same relay also accepts the Expo phone operator surface at `WS /ws`. The
phone must send a version-1 `hello` first, followed by `phone_pose` frames:

```json
{"type":"hello","protocolVersion":1,"platform":"ios","sessionId":"...","arm":"right"}
```

Phone input is converted into the existing `ControllerState` seam. It then
uses the same `ArmController`, closed-form SO-101 IK, `HoldLatch`, workspace
limits, joint limits and LeKiwi follower adapter as VR. A phone session owns
the arm exclusively; an active VR session wins/blocks phone ownership. The
phone `enabled` flag is the clutch and disconnect/recenter clears it.

The current Expo client can provide real camera, rotation and accelerometer
data. Accelerometer integration is only an approximate translation source;
ARKit/ARCore 6DoF should replace it before high-precision hardware operation.

## Чем это отличается от готовых проектов

Модель безопасности — из официального примера LeRobot `examples/isaac_teleop_to_so101`
(NVIDIA Isaac Teleop), транспорт через `adb reverse` — идея из
[vr-teleop-kit](https://github.com/Dream-Machines-Robotics/vr-teleop-kit). Ни один готовый
проект не подходил как есть: follower у LeKiwi не на локальном USB, а за `LeKiwiClient` на
Pi, и ни один не управляет базой.

Управление рукой отличается от всех разобранных проектов: вместо итерационной IK с «мягкой»
ориентацией здесь **замкнутая формула**, потому что SO-101 раскладывается точно — поворот
основания выбирает плоскость, три сустава образуют внутри неё плоский 3R, `wrist_roll`
крутит схват. Из этого следует, что рыскание схвата задано его положением и отдельным
каналом управления быть не может. Подробный разбор, обзор шести проектов и анализ задержки
моторов — в [docs/ARM_CONTROL.md](docs/ARM_CONTROL.md).

## Раскладка контроллера

Индексы кнопок — стандарт W3C
[«xr-standard»](https://www.w3.org/TR/webxr-gamepads-module-1/#xr-standard-gamepad-mapping),
и Touch у Quest 3 ему следует. Проверено замером на живой сессии, а не принято на веру.

| Кнопка | Индекс | Что делает |
| --- | --- | --- |
| Триггер | 0 | захват (аналогово) |
| Grip | 1 | **клатч** — рука слушается только пока зажат |
| Стик | — | база: перемещение и поворот |
| Нажатие стика | 3 | коротко — перецентровать панели; удержать — выйти из VR |
| A / X | 4 | **СТОП**, защёлкой |
| B / Y | 5 | снять СТОП (удержать 1 с); с зажатым grip — выход в рабочую позу |

## Модель безопасности

Четыре независимых слоя. Ни один не заменяет физическое отключение 12 В.

| Слой | Что делает | Где |
| --- | --- | --- |
| Клатч (deadman) | Рука выполняет команды **только** пока зажат grip. Отпустил — поза фиксируется (`HoldLatch`, а не повторная отправка измеренной позы: она проседала бы под тяжестью). | `arm.py` |
| Границы и темп по EE | Абсолютная цель обрезается по коробке рабочей зоны; шаг за кадр ограничен относительно **последней команды**. | `arm.py` |
| Темп по суставам | Не более `max_joint_step_deg` (6° = 180°/с) от **последней команды**. Это ограничитель скорости, разомкнутый: он не может заклинить и ему всё равно, насколько свежа телеметрия. | `arm.py` |
| Ошибка слежения | Не более `max_tracking_error_deg` (25°) от **измеренного** положения. Это детектор аварии — застрявший или упёршийся сустав, — а не регулятор: бюджет намеренно выше, чем нужно здоровой серве на полной скорости. | `arm.py` |
| Свежесть ввода | Данные старше `input_timeout_s` (250 мс), закрытый сокет, выход из VR или снятый шлем — всё это одно состояние: база в ноль, рука удерживает. | `state.py`, `teleop.py` |

Для сетевого LeKiwi есть ещё два слоя на стороне Pi:
`--robot.max_relative_target=10.0` и watchdog хоста 500 мс. Локальный SO-101 использует
синхронные rate/fault limits в `ArmController`; повторный `max_relative_target` там отключён,
поскольку он меняет отправленную цель вне состояния контроллера и вызывает постоянный clamp.

Разделение двух верхних лимитов — не педантизм. Раньше это был **один** лимит, отсчитанный
от измеренного положения, пришедшего по сети. Внутри контура с задержкой `d` такой лимит
задаёт потолок скорости `Δ/d` — при 8° и ~100 мс это 80°/с при возможностях серв ~300°/с, —
и потолок этот гуляет вместе с джиттером Wi-Fi. Отсчитывать темп можно только от последней
команды; по измерению, прошедшему через сеть, ограничивать нельзя вообще. Разбор с числами
в [docs/ARM_CONTROL.md](docs/ARM_CONTROL.md#5-отставание-моторов).

Захват клатча не двигает руку: на кадре нажатия origin защёлкивается от **измеренных**
суставов, так что первый же кадр командует ровно ту позу, в которой рука стоит. Это
проверяется тестом `test_engage_frame_does_not_move_the_arm` — отклонение 0.000°.

**STOP:** кнопка `A`/`X` защёлкивает аварийную остановку мгновенно. Снимается только
удержанием `B`/`Y` в течение секунды — задеть случайно нельзя.

## Установка

```bash
uv pip install -e .          # или: uv pip install -e ".[ik]"
```

Экстра `ik` больше не нужна для работы: кинематика замкнутая, рантайму не требуются ни
`placo`, ни URDF, ни меши. Она нужна, чтобы **проверить** кинематику — `tests/test_so101_chain.py`
загружает URDF через placo и сверяет с ним каждую зашитую константу. Без неё этот тест
пропускается, и ничто не заметит, если URDF в бакете изменится.

### Адрес робота

Зашитого адреса нет намеренно. Задаётся флагом `--remote-ip` или переменной окружения:

```bash
export LEKIWI_REMOTE_IP=192.168.1.42
```

### LeRobot на стороне робота

В **LeRobot 0.6.1** запуск host с `--robot.max_relative_target` (а так и надо — это
независимый слой безопасности) падает с `KeyError` на первом же кадре: `LeKiwi.send_action`
берёт ключи цели с суффиксом `.pos`, а измеренные позиции — без него.

Починено в апстриме — [huggingface/lerobot#4281](https://github.com/huggingface/lerobot/pull/4281).
Обновите LeRobot **на роботе** до версии с этой правкой; если остаётесь на 0.6.1, правка
однострочная:

```python
# src/lerobot/robots/lekiwi/lekiwi.py, в send_action
goal_present_pos = {
    key: (g_pos, present_pos[key.removesuffix(".pos")]) for key, g_pos in arm_goal_pos.items()
}
```

## Подключение шлема

WebXR работает только в безопасном контексте, поэтому просто `http://192.168.x.x:8443` из
шлема не откроется. Три способа, по убыванию предпочтительности.

**Без провода, через adb по Wi-Fi (рекомендуется):**

```bash
./scripts/quest_wifi.sh 8443
```

Кабель нужен **один раз**, чтобы разрешить беспроводную отладку; дальше шлем автономен.
`adb reverse` работает и поверх TCP-соединения, так что страница по-прежнему открывается
как `http://localhost:8443` — а localhost доверенный сам по себе, поэтому ни сертификатов,
ни предупреждений браузера, ни туннеля наружу с видео с камер робота.

Повторять после того, как шлем уснёт или переподключится к сети: проброс этого не переживает.

**По кабелю (самая низкая и ровная задержка):**

```bash
./scripts/quest_usb.sh 8443
```

Измерено на сопоставимом стенде: USB p50 1.6 мс, худший случай 3.8 мс; Wi-Fi p50 7.6 мс,
но **p95 130 мс**. Медианы приемлемы обе — портит ощущение именно хвост. Новую конфигурацию
поднимайте сначала на кабеле, чтобы «рука ведёт себя странно» нельзя было списать на сеть.

**HTTPS по локальной сети (если adb не нужен вовсе):**

```bash
./scripts/make_cert.sh 192.168.1.10        # адрес ЭТОЙ машины, не робота
lekiwi-vr-teleop --host 0.0.0.0 --cert certs/cert.pem --key certs/key.pem
```

Самоподписанный сертификат никому не доверен, поэтому в шлеме придётся один раз принять
предупреждение. `--host 0.0.0.0` открывает пульт всей сети — только в сети, которую вы
контролируете. Каталог `certs/` в `.gitignore`; ключи не коммитить.

## Запуск

### SO-101 follower cục bộ (Quest 3 + USB)

Đây là đường chạy dành cho một cánh tay follower, không kết nối leader và không dùng
LeKiwi host/ZMQ. Lần đầu luôn chạy fake; lệnh này không mở bất kỳ cổng serial nào:

**Bố trí đã kiểm chứng trên máy hiện tại:** người vận hành ban đầu ngồi chính diện laptop,
robot đặt bên tay phải. Khởi động server và follower trước; sau khi trang VR đã vào được,
di chuyển sang vị trí thao tác và nhìn cùng hướng với cánh tay robot. Recenter Quest tại
hướng đó, giữ bàn tay ở tư thế thoải mái, rồi mới chạm ngón cái-ngón giữa để chốt origin và
bật clutch. Không bật clutch khi vẫn đang nhìn laptop, vì heading lúc lấy origin sẽ không
khớp tư thế vận hành.

```bash
cd /home/quangduc/Code/VRTeleop/lekiwi-vr-teleop
/home/quangduc/miniconda3/envs/lerobot/bin/python3 -m pip install -e .
./scripts/make_cert.sh 192.168.123.8   # IP của máy chạy server; làm một lần
/home/quangduc/miniconda3/envs/lerobot/bin/so101-vr-teleop \
  --host 0.0.0.0 --port 8443 \
  --cert certs/cert.pem --key certs/key.pem --arms left
```

Mở URL được in ra trên Quest. URL có `?hand=left`, vì vậy nguồn tay phải sẽ không thể
chiếm quyền điều khiển. Với tay trần:

1. Chạm ngón cái-ngón giữa một lần để bật clutch. Điểm robot đang đứng và vị trí bàn tay
   lúc đó được chốt làm gốc, nên robot không nhảy.
2. Di chuyển lòng bàn tay tương đối: đưa lên/hạ xuống, vươn tới/thu lại và sang trái/phải.
3. Chụm ngón cái-ngón trỏ để đóng gripper; mở hai ngón để mở gripper.
4. Chạm ngón cái-ngón giữa lần nữa để tắt clutch và giữ tay robot tại chỗ.

Với XRHand, hướng đầu kẹp được giữ cố định mặc định: nâng/hạ hoặc vươn/thu tay sẽ không làm
đầu kẹp chúi hay roll theo góc lòng bàn tay. Chỉ thêm `--track-hand-orientation` khi thật sự
muốn pitch/roll đầu kẹp bằng cổ tay.

Sau khi mô hình fake đi đúng chiều, xác định **đúng follower** bằng tên thiết bị ổn định:

```bash
ls -l /dev/serial/by-id/
```

Rút leader ra nếu còn cắm. Không đoán theo `/dev/ttyACM0` hay `/dev/ttyACM1`, vì số này có
thể đổi sau mỗi lần cắm. Chạy thật chỉ khi có cả hai cờ sau:

```bash
/home/quangduc/miniconda3/envs/lerobot/bin/so101-vr-teleop \
  --host 0.0.0.0 --port 8443 \
  --cert certs/cert.pem --key certs/key.pem --arms left \
  --position-scale 0.5 --base-yaw-offset -90 --smoothing 0.35 --real \
  --robot-id my_awesome_bimanual_follower_left \
  --robot-port /dev/serial/by-id/DUONG_DAN_CUA_FOLLOWER
```

Đặt tay robot ở giữa vùng làm việc trước khi chạy, bắt đầu với `--position-scale 0.5`, và
để tay gần nút nguồn. Nút **DỪNG** trên trang chốt software stop; dữ liệu WebXR cũ quá
250 ms, mất khớp bàn tay, pose lỗi hoặc spike lớn cũng tự thu hồi quyền điều khiển.

### Этап 1 — без робота

Ничего не может поехать: подключения к роботу нет вообще.

```bash
lekiwi-vr-relay --port 8443
```

Открыть страницу в шлеме, нажать «Войти в VR». В терминале раз в две секунды печатается
частота приходящих кадров, возраст последнего, RTT и состояние обоих контроллеров. Здесь
проверяются трекинг, задержка и то, что STOP защёлкивается.

Без шлема то же самое проверяется поддельным клиентом:

```bash
python tools/fake_headset.py --seconds 5
```

### Этап 2 — с роботом

Порядок из `docs/LEKIWI_SETUP_AND_TELEOP.md` соблюдается полностью: сначала host на Pi с
`--robot.max_relative_target=10.0`, момент выключен, лидер и follower совмещены.

```bash
lekiwi-vr-teleop --remote-ip 192.168.1.42 --robot-id lekiwi_01
```

Первое движение — очень короткое удержание стика базы, затем короткое нажатие grip.

Полезные флаги: `--position-scale 0.5` (рука проходит вдвое меньше кисти — для точной
работы), `--arm-hand left`, `--base-hand right`.

## Режимы отображения

**Проходное видео (по умолчанию).** Сессия `immersive-ar`: видно реальную комнату,
реального робота и собственные руки, панели висят поверх. Для робота, которым управляют из
той же комнаты, где он стоит, это правильный режим — смотреть на живую машину важнее, чем
на чистый фон.

**Непрозрачный VR.** Сессия `immersive-vr`: только панели на чёрном. Пригодится, если
оператор не в одном помещении с роботом.

В обоих режимах в позах контроллеров рисуются метки-прицелы (синяя левая, жёлтая правая) —
иначе в непрозрачном режиме оператор не видит собственных рук.

Отслеживание живых рук запрашивается как `hand-tracking`: **без этого шлем не отдаёт
странице никаких источников ввода**, когда контроллеры лежат выключенными, — сессия
выглядит живой, а `inputSources` пуст. Поза ладони строится по запястью и трём пястным
суставам. Касание большого и среднего пальцев переключает клатч, расстояние между большим
и указательным управляет захватом. Параметр URL `?hand=left` или `?hand=right` ограничивает
сессию одной выбранной рукой.

## Управление

| Действие | Кнопка |
| --- | --- |
| Рука следует за кистью | удерживать **grip** (правый) |
| Гриппер | **триггер**, аналогово |
| База вперёд/назад/вбок | **стик** (левый) |
| Поворот базы | **стик X** (правый) |
| **СТОП** | **A / X** — мгновенно |
| Снять СТОП | **B / Y**, удерживать 1 с |

Гриппер задаётся абсолютно: на кадре захвата челюсть сразу принимает положение,
соответствующее текущему нажатию триггера. Если рука что-то держит, перед повторным
захватом клатча стоит подтянуть триггер.

## Тесты

```bash
pytest -q
```

99 тестов: преобразование систем координат, клатч, маппинг базы, fake follower, фильтрация
pose/spike, гейт свежести ввода и пайплайн IK (проверки URDF пропускаются без экстра `ik`).

## Известные ограничения

- Панель телеметрии в VR — растровый canvas, мелкий шрифт при взгляде под углом.
- 3D-скелет отрисован, но на железе ещё не смотрелся: проверялся отрисовкой той же
  геометрии в SVG и сверкой прямой кинематики JS с Python (расхождение 1e-9 м).
- MJPEG-панели идут через тот же сокет, что и позы; на Wi-Fi при просадке канала картинка
  деградирует раньше, чем управление, но конкуренцию за полосу создаёт.
- Hand tracking не подключён: только Touch-контроллеры. Это осознанно — у контроллера есть
  физический grip под deadman, у руки его нет.
- Знаки `--roll-gain` и `--pitch-gain` на железе не подтверждены: куда повернётся схват
  при крене кисти, зависит от монтажа руки и из URDF не выводится.
- База поворачивается, а система координат шлема — нет, поэтому поворот базы вносит
  рассогласование. Ни один из разобранных проектов этого не решает.

## Лицензия

Apache-2.0. Модель безопасности и семантика клатча следуют LeRobot
`examples/isaac_teleop_to_so101` (Copyright 2026 NVIDIA Corporation и
The HuggingFace Inc. team, Apache-2.0).
