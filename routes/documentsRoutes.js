const express = require("express");
const router = express.Router();
const documentController = require("../controllers/documentController");
const upload = require("../middleware/uploadDocument");

router.get("/", documentController.getDocuments);
router.get("/:id", documentController.getDocumentById);
router.post("/", upload.single("file"), documentController.createDocument);
router.post("/:id/download", documentController.downloadDocument);
router.put("/:id", upload.single("file"), documentController.updateDocument);
router.delete("/:id", documentController.deleteDocument);

module.exports = router;
