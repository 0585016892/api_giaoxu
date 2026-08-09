const db = require("../config/db");
const moment = require("moment");

// helper log
const log = (title, data) => {
  console.log(`\n================ ${title} ================`);
  console.log(JSON.stringify(data, null, 2));
  console.log(`============== END ${title} ==============\n`);
};

const errorLog = (title, err) => {
  console.error(`\n❌❌❌ ${title} ❌❌❌`);
  console.error(err);
  console.error(`❌ END ${title} ❌\n`);
};

/* ================= CREATE SCHEDULE ================= */
exports.createSchedule = async (req, res) => {
  try {
    log("CREATE SCHEDULE BODY", req.body);

    const { church_id, week_start, year } = req.body;

    if (!church_id || !week_start) {
      return res.status(400).json({
        message: "church_id và week_start là bắt buộc",
      });
    }

    const start = moment(week_start);
    const end = start.clone().add(6, "days");

    log("PARSED DATE RANGE", {
      start: start.format("YYYY-MM-DD"),
      end: end.format("YYYY-MM-DD"),
    });

    const [result] = await db.query(
      `INSERT INTO liturgical_schedules
      (church_id, year, week_start, week_end, title)
      VALUES (?, ?, ?, ?, ?)`,
      [
        church_id,
        year || start.year(),
        start.format("YYYY-MM-DD"),
        end.format("YYYY-MM-DD"),
        `Tuần ${start.format("DD/MM")}`,
      ],
    );

    log("SCHEDULE CREATED", { schedule_id: result.insertId });

    return res.json({
      message: "Tạo schedule thành công",
      schedule_id: result.insertId,
    });
  } catch (err) {
    errorLog("CREATE SCHEDULE ERROR", err);
    return res.status(500).json({ message: "Lỗi server", error: err.message });
  }
};

/* ================= GET WEEK ================= */
exports.getWeekSchedule = async (req, res) => {
  try {
    log("GET WEEK QUERY", req.query);

    const { week_start, church_id } = req.query;

    if (!week_start || !church_id) {
      return res.status(400).json({
        message: "week_start và church_id là bắt buộc",
      });
    }

    let [schedule] = await db.query(
      `SELECT * FROM liturgical_schedules
       WHERE week_start = ? AND church_id = ?
       LIMIT 1`,
      [week_start, church_id],
    );

    log("SCHEDULE FOUND", schedule);

    // AUTO CREATE
    if (!schedule.length) {
      const start = moment(week_start);
      const end = start.clone().add(6, "days");

      const [created] = await db.query(
        `INSERT INTO liturgical_schedules
        (church_id, week_start, week_end, title)
        VALUES (?, ?, ?, ?)`,
        [
          church_id,
          week_start,
          end.format("YYYY-MM-DD"),
          `Tuần ${start.format("DD/MM")}`,
        ],
      );

      schedule = [
        {
          id: created.insertId,
          church_id,
          week_start,
          week_end: end.format("YYYY-MM-DD"),
        },
      ];

      log("AUTO CREATED SCHEDULE", schedule);
    }

    const scheduleId = schedule[0].id;

    const [events] = await db.query(
      `SELECT * FROM liturgical_events
       WHERE schedule_id = ?
       ORDER BY event_date ASC, event_time ASC`,
      [scheduleId],
    );

    log("EVENTS LOADED", { count: events.length });

    return res.json({
      schedule: schedule[0],
      events,
    });
  } catch (err) {
    errorLog("GET WEEK ERROR", err);
    return res.status(500).json({ message: "Lỗi server", error: err.message });
  }
};

/* ================= ADD EVENT ================= */
exports.addEvent = async (req, res) => {
  try {
    log("ADD EVENT BODY", req.body);

    let {
      schedule_id,
      week_start,
      church_id,
      title,
      event_date,
      event_time,
      type,
      church_name,
      priest,
      note,
      is_priority = 0,
    } = req.body;

    // parse debug
    log("PARSED FIELDS", {
      schedule_id,
      week_start,
      church_id,
      title,
      event_date,
    });

    if (!title || !event_date) {
      return res.status(400).json({
        message: "title và event_date là bắt buộc",
      });
    }

    /* AUTO FIND SCHEDULE */
    if (!schedule_id) {
      if (!week_start || !church_id) {
        return res.status(400).json({
          message: "Thiếu schedule_id hoặc (week_start + church_id)",
        });
      }

      const [rows] = await db.query(
        `SELECT id FROM liturgical_schedules
         WHERE week_start = ? AND church_id = ?`,
        [week_start, church_id],
      );

      log("SCHEDULE LOOKUP RESULT", rows);

      if (!rows.length) {
        return res.status(404).json({
          message: "Không tìm thấy schedule tuần này",
        });
      }

      schedule_id = rows[0].id;
    }

    /* NORMALIZE TYPE */
    const typeMap = {
      cn: "CN",
      thuong: "THUONG",
      cuoi: "CUOI",
      an_tang: "AN_TANG",
    };

    type = typeMap[(type || "").toLowerCase()] || "THUONG";

    /* INSERT */
    const [result] = await db.query(
      `INSERT INTO liturgical_events
      (schedule_id, title, event_date, event_time, type, church_name, priest, note, is_priority)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        schedule_id,
        title,
        event_date,
        event_time || null,
        type,
        church_name || null,
        priest || null,
        note || null,
        is_priority,
      ],
    );

    log("EVENT CREATED", { event_id: result.insertId });

    return res.json({
      message: "Tạo event thành công",
      event_id: result.insertId,
    });
  } catch (err) {
    errorLog("ADD EVENT ERROR", err);
    return res.status(500).json({
      message: "Lỗi server",
      error: err.message,
    });
  }
};

/* ================= COPY WEEK ================= */
exports.copyWeek = async (req, res) => {
  try {
    log("COPY WEEK BODY", req.body);

    const { from_schedule_id, to_week_start, church_id } = req.body;

    const [target] = await db.query(
      `SELECT id FROM liturgical_schedules
       WHERE week_start = ? AND church_id = ?`,
      [to_week_start, church_id],
    );

    if (!target.length) {
      return res.status(404).json({
        message: "Tuần đích chưa tồn tại",
      });
    }

    const toId = target[0].id;

    const [events] = await db.query(
      `SELECT * FROM liturgical_events WHERE schedule_id = ?`,
      [from_schedule_id],
    );

    log("COPY EVENTS COUNT", events.length);

    for (const e of events) {
      await db.query(
        `INSERT INTO liturgical_events
        (schedule_id, title, event_date, event_time, type, church_name, priest, note, is_priority)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          toId,
          e.title,
          moment(e.event_date).add(7, "days").format("YYYY-MM-DD"),
          e.event_time,
          e.type,
          e.church_name,
          e.priest,
          e.note,
          e.is_priority,
        ],
      );
    }

    return res.json({ message: "Copy tuần thành công" });
  } catch (err) {
    errorLog("COPY WEEK ERROR", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
};

/* ================= TOGGLE PRIORITY ================= */
exports.togglePriority = async (req, res) => {
  try {
    const { id } = req.params;

    log("TOGGLE PRIORITY ID", id);

    await db.query(
      `UPDATE liturgical_events
       SET is_priority = NOT is_priority
       WHERE id = ?`,
      [id],
    );

    return res.json({ message: "OK" });
  } catch (err) {
    errorLog("TOGGLE PRIORITY ERROR", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
};

/* ================= GENERATE YEAR ================= */
exports.generateYear = async (req, res) => {
  try {
    const { year, church_id } = req.body;

    log("GENERATE YEAR", { year, church_id });

    const start = moment(`${year}-01-01`);
    const end = moment(`${year}-12-31`);

    let current = start.clone();

    while (current.isBefore(end)) {
      const weekStart = current.clone().startOf("week");
      const weekEnd = weekStart.clone().add(6, "days");

      await db.query(
        `INSERT IGNORE INTO liturgical_schedules
        (church_id, week_start, week_end, title)
        VALUES (?, ?, ?, ?)`,
        [
          church_id,
          weekStart.format("YYYY-MM-DD"),
          weekEnd.format("YYYY-MM-DD"),
          `Tuần ${weekStart.format("DD/MM")}`,
        ],
      );

      current.add(7, "days");
    }

    return res.json({ message: "Generate năm thành công" });
  } catch (err) {
    errorLog("GENERATE YEAR ERROR", err);
    return res.status(500).json({ message: "Lỗi server", error: err.message });
  }
};
exports.deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;

    console.log("🗑️ DELETE EVENT REQUEST:", id);

    if (!id) {
      return res.status(400).json({
        message: "Thiếu event id",
      });
    }

    // kiểm tra tồn tại
    const [check] = await db.query(
      `SELECT id FROM liturgical_events WHERE id = ?`,
      [id],
    );

    if (!check.length) {
      return res.status(404).json({
        message: "Không tìm thấy lễ để xoá",
      });
    }

    // xóa event
    await db.query(`DELETE FROM liturgical_events WHERE id = ?`, [id]);

    console.log("✅ DELETE SUCCESS:", id);

    return res.json({
      message: "Xoá lễ thành công",
      deleted_id: id,
    });
  } catch (err) {
    console.error("❌ DELETE EVENT ERROR:", err);

    // FK error hoặc constraint
    if (err.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(400).json({
        message: "Không thể xoá vì dữ liệu đang được sử dụng",
      });
    }

    return res.status(500).json({
      message: "Lỗi server",
      error: err.message,
    });
  }
};
exports.updateEvent = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      title,
      event_date,
      event_time,
      type,
      church_name,
      priest,
      note,
      is_priority,
    } = req.body;

    console.log("✏️ UPDATE EVENT REQUEST:", {
      id,
      body: req.body,
    });

    if (!id) {
      return res.status(400).json({
        message: "Thiếu event id",
      });
    }

    // kiểm tra tồn tại
    const [check] = await db.query(
      `SELECT * FROM liturgical_events WHERE id = ?`,
      [id],
    );

    if (!check.length) {
      return res.status(404).json({
        message: "Không tìm thấy lễ để cập nhật",
      });
    }

    // build data fallback (giữ data cũ nếu không truyền lên)
    const current = check[0];

    const newTitle = title ?? current.title;
    const newDate = event_date ?? current.event_date;
    const newTime = event_time ?? current.event_time;
    const newType = (type ?? current.type ?? "THUONG").toUpperCase();
    const newChurch = church_name ?? current.church_name;
    const newPriest = priest ?? current.priest;
    const newNote = note ?? current.note;
    const newPriority =
      is_priority !== undefined ? is_priority : current.is_priority;

    // update
    await db.query(
      `UPDATE liturgical_events SET
        title = ?,
        event_date = ?,
        event_time = ?,
        type = ?,
        church_name = ?,
        priest = ?,
        note = ?,
        is_priority = ?,
        updated_at = NOW()
      WHERE id = ?`,
      [
        newTitle,
        newDate,
        newTime,
        newType,
        newChurch,
        newPriest,
        newNote,
        newPriority,
        id,
      ],
    );

    console.log("✅ UPDATE SUCCESS:", id);

    return res.json({
      message: "Cập nhật lễ thành công",
      event_id: id,
    });
  } catch (err) {
    console.error("❌ UPDATE EVENT ERROR:", err);

    return res.status(500).json({
      message: "Lỗi server",
      error: err.message,
    });
  }
};
// =========================
// 8. GET MASS SCHEDULE
// =========================
exports.getMassSchedule = async (req, res) => {
  try {
    let {
      church_id,
      start_date,
      end_date,
      type,
      page = 1,
      limit = 50,
    } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);
    const offset = (page - 1) * limit;

    const today = moment().format("YYYY-MM-DD");
    const nowTime = moment().format("HH:mm:ss");

    let where = "WHERE 1=1";
    let params = [];

    // =========================
    // FILTER CHURCH
    // =========================
    if (church_id) {
      where += " AND s.church_id = ?";
      params.push(church_id);
    }

    // =========================
    // AUTO FILTER NGÀY HIỆN TẠI + TƯƠNG LAI
    // =========================

    // Nếu không truyền start_date → lấy từ hôm nay
    if (!start_date) {
      where += " AND e.event_date >= ?";
      params.push(today);
    } else {
      // Nếu truyền nhưng nhỏ hơn hôm nay → ép về hôm nay
      const validStart = start_date < today ? today : start_date;

      where += " AND e.event_date >= ?";
      params.push(validStart);
    }

    // End date (nếu có)
    if (end_date) {
      where += " AND e.event_date <= ?";
      params.push(end_date);
    }

    // =========================
    // Nếu là hôm nay → loại bỏ lễ đã qua giờ
    // =========================
    where += `
      AND (
        e.event_date > ?
        OR (e.event_date = ? AND (e.event_time IS NULL OR e.event_time >= ?))
      )
    `;
    params.push(today, today, nowTime);

    // =========================
    // FILTER TYPE EVENT
    // =========================
    if (type) {
      where += " AND e.type = ?";
      params.push(type);
    }

    // =========================
    // COUNT
    // =========================
    const [[count]] = await db.query(
      `
      SELECT COUNT(*) as total
      FROM liturgical_events e
      JOIN liturgical_schedules s ON e.schedule_id = s.id
      JOIN churches c ON s.church_id = c.id
      ${where}
      `,
      params,
    );

    // =========================
    // DATA
    // =========================
    const [rows] = await db.query(
      `
      SELECT 
        e.id as event_id,
        e.title,
        e.event_date,
        e.event_time,
        e.type,
        e.priest,
        e.note,
        e.is_priority,

        s.id as schedule_id,
        s.week_start,
        s.week_end,

        c.id as church_id,
        c.name as church_name,
        c.address,
        c.district,
        c.ward,
        c.latitude,
        c.longitude

      FROM liturgical_events e
      JOIN liturgical_schedules s ON e.schedule_id = s.id
      JOIN churches c ON s.church_id = c.id

      ${where}

      ORDER BY e.event_date ASC, e.event_time ASC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset],
    );

    return res.json({
      success: true,
      data: rows,
      pagination: {
        total: count.total,
        page,
        limit,
        totalPages: Math.ceil(count.total / limit),
      },
    });
  } catch (err) {
    console.error("GET MASS SCHEDULE ERROR:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
