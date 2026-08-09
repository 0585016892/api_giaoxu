const express = require("express");
const { SitemapStream, streamToPromise } = require("sitemap");
const db = require("../config/db");

const router = express.Router();

router.get("/sitemap.xml", async (req, res) => {
  try {
    const smStream = new SitemapStream({
      hostname: "https://www.giaoxudongquan.site",
    });

    const staticRoutes = [
      "/",
      "/giao-ly/du-tong",
      "/giao-ly/hon-nhan",
      "/prayers",
      "/prayers/thanh-ca",
      "/giao-xu",
      "/tai-lieu",
      "/contact",
      "/su-kien",
      "/bang-tin",
      "/hoi-doan",
      "/exam",
      "/exam-search",
      "/exam-prayer",
      "/guide",
      "/terms",
      "/giao-ho",
    ];

    staticRoutes.forEach((route) => {
      smStream.write({
        url: route,
        changefreq: "daily",
        priority: 0.8,
      });
    });

    const [events] = await db.query(
      "SELECT slug FROM events WHERE slug IS NOT NULL",
    );

    events.forEach((item) => {
      smStream.write({
        url: `/su-kien/${item.slug}`,
        priority: 0.7,
      });
    });

    const [groups] = await db.query(
      "SELECT slug FROM groups WHERE slug IS NOT NULL",
    );

    groups.forEach((item) => {
      smStream.write({
        url: `/hoi-doan/${item.slug}`,
        priority: 0.7,
      });
    });

    smStream.end();

    const sitemap = await streamToPromise(smStream);

    res.header("Content-Type", "application/xml");
    res.send(sitemap.toString());
  } catch (err) {
    console.error(err);
    res.status(500).send("Lỗi tạo sitemap.");
  }
});

module.exports = router;
