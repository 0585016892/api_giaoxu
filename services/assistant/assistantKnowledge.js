// services/assistant/assistantKnowledge.js

/**
 * ============================================================
 * FAITHEDU ASSISTANT KNOWLEDGE
 * ============================================================
 *
 * Phase 1:
 * - Không dùng AI
 * - Không dùng MySQL
 * - Không gọi API bên ngoài
 * - Chỉ tìm kiếm trong knowledge của FaithEdu
 *
 * Sau này có thể bổ sung thêm article mà không cần sửa
 * assistantService.
 */

const knowledge = [
  // ============================================================
  // BẮT ĐẦU
  // ============================================================

  {
    id: "getting-started",
    category: "Bắt đầu sử dụng",
    title: "Bắt đầu sử dụng FaithEdu",

    description:
      "Hướng dẫn những bước cơ bản để bắt đầu sử dụng hệ thống FaithEdu.",

    keywords: [
      "bắt đầu",
      "bắt đầu sử dụng",
      "sử dụng faithEdu",
      "sử dụng hệ thống",
      "đăng nhập",
      "làm quen",
      "hướng dẫn",
      "hệ thống",
      "faithEdu",
    ],

    steps: [
      "Đăng nhập bằng tài khoản được giáo xứ cấp.",
      "Sau khi đăng nhập, kiểm tra các chức năng được hiển thị trên menu.",
      "Chọn chức năng bạn cần sử dụng.",
      "Quyền sử dụng chức năng phụ thuộc vào vai trò của tài khoản.",
    ],

    tips: [
      "Nếu không nhìn thấy một chức năng, có thể tài khoản của bạn chưa được cấp quyền.",
      "Không chia sẻ tài khoản hoặc mật khẩu cho người khác.",
    ],
  },

  // ============================================================
  // HỌC SINH
  // ============================================================

  {
    id: "students",
    category: "Học sinh",
    title: "Quản lý học sinh",

    description: "Hướng dẫn quản lý danh sách và hồ sơ học sinh trong giáo xứ.",

    keywords: [
      "học sinh",
      "quản lý học sinh",
      "danh sách học sinh",
      "thêm học sinh",
      "sửa học sinh",
      "chỉnh sửa học sinh",
      "hồ sơ học sinh",
      "thông tin học sinh",
      "xóa học sinh",
      "tạo học sinh",
    ],

    steps: [
      "Mở chức năng Học sinh.",
      "Tại đây bạn có thể xem danh sách học sinh.",
      "Chọn Thêm học sinh để tạo hồ sơ mới.",
      "Chọn một học sinh để xem hoặc chỉnh sửa thông tin.",
      "Có thể quản lý lớp, mã QR và các thông tin liên quan của học sinh.",
    ],

    tips: [
      "Kiểm tra thông tin học sinh trước khi lưu.",
      "Mỗi học sinh cần thuộc đúng giáo xứ hiện tại.",
    ],
  },

  {
    id: "student-import-excel",
    category: "Học sinh",
    title: "Import học sinh bằng Excel",

    description: "Hướng dẫn nhập danh sách nhiều học sinh bằng file Excel.",

    keywords: [
      "import",
      "import excel",
      "excel",
      "nhập excel",
      "nhập học sinh",
      "import học sinh",
      "thêm nhiều học sinh",
      "danh sách excel",
      "file excel",
      "upload excel",
    ],

    steps: [
      "Mở chức năng Học sinh.",
      "Chọn chức năng Import Excel.",
      "Chuẩn bị file Excel theo đúng mẫu của FaithEdu.",
      "Đảm bảo các cột bắt buộc được nhập đầy đủ.",
      "Chọn file Excel và tải lên hệ thống.",
      "Kiểm tra kết quả import sau khi hệ thống xử lý.",
    ],

    tips: [
      "Nên sử dụng mẫu Excel do FaithEdu cung cấp.",
      "Không tự ý thay đổi tên các cột trong mẫu.",
      "Kiểm tra dữ liệu trước khi import số lượng lớn.",
    ],
  },

  {
    id: "student-qr",
    category: "Học sinh",
    title: "Mã QR học sinh",

    description: "Hướng dẫn sử dụng mã QR của học sinh trong FaithEdu.",

    keywords: [
      "qr học sinh",
      "mã qr học sinh",
      "qr",
      "mã qr",
      "tạo qr",
      "in qr",
      "quét qr học sinh",
      "mã học sinh",
    ],

    steps: [
      "Mở hồ sơ học sinh.",
      "Kiểm tra mã QR được hệ thống cấp cho học sinh.",
      "Có thể sử dụng mã QR này để điểm danh nếu giáo xứ bật chức năng điểm danh QR.",
      "Đảm bảo mã QR được in hoặc hiển thị rõ ràng khi sử dụng.",
    ],

    tips: [
      "Không sử dụng mã QR của học sinh khác.",
      "Nếu mã QR không nhận diện được, kiểm tra chất lượng hình ảnh hoặc bản in.",
    ],
  },

  {
    id: "student-class",
    category: "Học sinh",
    title: "Phân lớp và chuyển lớp học sinh",

    description:
      "Hướng dẫn đưa học sinh vào lớp hoặc chuyển học sinh sang lớp khác.",

    keywords: [
      "phân lớp",
      "xếp lớp",
      "thêm vào lớp",
      "chuyển lớp",
      "đổi lớp",
      "học sinh vào lớp",
      "học sinh thuộc lớp nào",
      "lớp của học sinh",
    ],

    steps: [
      "Mở hồ sơ học sinh hoặc chức năng quản lý lớp.",
      "Chọn học sinh cần phân lớp.",
      "Chọn lớp phù hợp.",
      "Lưu thay đổi.",
      "Kiểm tra lại danh sách học sinh của lớp.",
    ],

    tips: [
      "Kiểm tra đúng năm học và lớp trước khi chuyển.",
      "Sau khi chuyển lớp nên kiểm tra lại điểm danh và thông tin lớp nếu cần.",
    ],
  },

  // ============================================================
  // LỚP HỌC
  // ============================================================

  {
    id: "classes",
    category: "Lớp học",
    title: "Quản lý lớp học",

    description: "Hướng dẫn quản lý các lớp giáo lý trong giáo xứ.",

    keywords: [
      "lớp",
      "lớp học",
      "quản lý lớp",
      "tạo lớp",
      "thêm lớp",
      "danh sách lớp",
      "lớp giáo lý",
      "giáo lý",
    ],

    steps: [
      "Mở chức năng Lớp học.",
      "Xem danh sách các lớp hiện có.",
      "Chọn Thêm lớp nếu cần tạo lớp mới.",
      "Nhập thông tin lớp.",
      "Lưu lớp.",
    ],

    tips: [
      "Nên đặt tên lớp rõ ràng để giáo lý viên dễ nhận biết.",
      "Kiểm tra giáo lý viên phụ trách lớp sau khi tạo.",
    ],
  },

  {
    id: "class-teacher",
    category: "Lớp học",
    title: "Phân công giáo viên cho lớp",

    description: "Hướng dẫn phân công người phụ trách lớp.",

    keywords: [
      "phân công",
      "giáo viên",
      "giáo lý viên",
      "huấn luyện viên",
      "phụ trách lớp",
      "người phụ trách",
      "gán giáo viên",
      "gán glv",
    ],

    steps: [
      "Mở chức năng Lớp học.",
      "Chọn lớp cần phân công.",
      "Mở phần quản lý giáo viên hoặc người phụ trách.",
      "Chọn người phù hợp.",
      "Lưu thay đổi.",
    ],

    tips: [
      "Người dùng chỉ nhìn thấy các thao tác phù hợp với quyền tài khoản.",
    ],
  },

  // ============================================================
  // ĐIỂM DANH
  // ============================================================

  {
    id: "attendance",
    category: "Điểm danh",
    title: "Điểm danh học sinh",

    description: "Hướng dẫn điểm danh học sinh trong FaithEdu.",

    keywords: [
      "điểm danh",
      "điểm danh học sinh",
      "điểm danh giáo lý",
      "điểm danh lớp",
      "có mặt",
      "vắng",
      "đi trễ",
      "có phép",
      "chấm công học sinh",
    ],

    steps: [
      "Mở chức năng Điểm danh.",
      "Chọn loại điểm danh cần thực hiện.",
      "Chọn lớp nếu loại điểm danh yêu cầu chọn lớp.",
      "Thực hiện điểm danh bằng QR hoặc phương thức được hệ thống hỗ trợ.",
      "Kiểm tra trạng thái học sinh.",
      "Chốt điểm danh khi đã hoàn tất.",
    ],

    tips: [
      "Kiểm tra đúng ngày trước khi bắt đầu.",
      "Kiểm tra lại các trường hợp vắng hoặc đi trễ trước khi chốt.",
    ],
  },

  {
    id: "attendance-qr",
    category: "Điểm danh",
    title: "Điểm danh bằng mã QR",

    description:
      "Hướng dẫn sử dụng camera để quét mã QR học sinh khi điểm danh.",

    keywords: [
      "điểm danh qr",
      "qr điểm danh",
      "quét qr",
      "quét mã qr",
      "mã qr điểm danh",
      "camera điểm danh",
      "điểm danh bằng qr",
      "scan qr",
    ],

    steps: [
      "Mở chức năng Điểm danh.",
      "Chọn loại điểm danh cần thực hiện.",
      "Mở chức năng Quét QR.",
      "Cho phép trình duyệt sử dụng camera nếu được hỏi.",
      "Đưa mã QR của học sinh vào vùng quét.",
      "Kiểm tra kết quả điểm danh trên màn hình.",
    ],

    tips: [
      "Giáo xứ phải bật chức năng điểm danh QR.",
      "Mã QR phải thuộc đúng học sinh.",
      "Đảm bảo camera hoạt động bình thường.",
      "Nếu dùng nhiều máy điểm danh cùng lúc, mỗi máy có thể đăng nhập bằng tài khoản được cấp quyền phù hợp.",
    ],
  },

  {
    id: "attendance-mass",
    category: "Điểm danh",
    title: "Điểm danh Thánh lễ",

    description: "Hướng dẫn điểm danh học sinh tham dự Thánh lễ.",

    keywords: [
      "thánh lễ",
      "điểm danh thánh lễ",
      "điểm danh lễ",
      "đi lễ",
      "tham dự thánh lễ",
      "mass",
      "điểm danh mass",
    ],

    steps: [
      "Mở chức năng Điểm danh.",
      "Chọn loại điểm danh Thánh lễ.",
      "Thực hiện điểm danh theo phương thức được giáo xứ cho phép.",
      "Kiểm tra danh sách học sinh đã được ghi nhận.",
      "Chốt điểm danh khi hoàn tất.",
    ],

    tips: [
      "Điểm danh Thánh lễ không yêu cầu chọn lớp.",
      "Kiểm tra đúng ngày trước khi điểm danh.",
    ],
  },

  {
    id: "attendance-finish",
    category: "Điểm danh",
    title: "Chốt điểm danh",

    description: "Hướng dẫn kiểm tra và chốt một phiên điểm danh.",

    keywords: [
      "chốt điểm danh",
      "kết thúc điểm danh",
      "đóng điểm danh",
      "khóa điểm danh",
      "finish attendance",
      "hoàn tất điểm danh",
    ],

    steps: [
      "Kiểm tra danh sách điểm danh.",
      "Kiểm tra các trường hợp có mặt, đi trễ, vắng hoặc có phép.",
      "Chọn chức năng chốt hoặc kết thúc điểm danh.",
      "Xác nhận thao tác.",
    ],

    tips: [
      "Kiểm tra dữ liệu thật kỹ trước khi chốt.",
      "Sau khi chốt, dữ liệu có thể bị khóa tùy quy định của hệ thống.",
    ],
  },

  // ============================================================
  // TÀI KHOẢN
  // ============================================================

  {
    id: "accounts",
    category: "Tài khoản & phân quyền",
    title: "Tài khoản và phân quyền",

    description: "Giải thích các vai trò tài khoản và quyền sử dụng FaithEdu.",

    keywords: [
      "tài khoản",
      "phân quyền",
      "quyền",
      "role",
      "vai trò",
      "giáo viên",
      "huấn luyện viên",
      "giáo lý viên",
      "admin",
      "quản trị",
      "quyền sử dụng",
    ],

    steps: [
      "Mỗi tài khoản được gán một vai trò.",
      "Vai trò quyết định những chức năng tài khoản có thể sử dụng.",
      "Nếu cần thay đổi quyền, liên hệ người có quyền quản trị.",
      "Không chia sẻ tài khoản với người khác.",
    ],

    tips: [
      "Nếu không nhìn thấy một chức năng, hãy kiểm tra vai trò tài khoản.",
      "Không tự ý sử dụng tài khoản của người khác.",
    ],
  },

  {
    id: "role-teacher",
    category: "Tài khoản & phân quyền",
    title: "Vai trò Giáo viên",

    description: "Giáo viên chủ yếu quản trị các lớp được phân công.",

    keywords: [
      "giáo viên",
      "role giáo viên",
      "quyền giáo viên",
      "giáo viên được làm gì",
      "quyền teacher",
    ],

    steps: [
      "Tài khoản Giáo viên có quyền sử dụng các chức năng được hệ thống cấp cho vai trò này.",
      "Quyền quản trị chủ yếu tập trung vào lớp học được phân công.",
      "Nếu cần thêm quyền, liên hệ quản trị viên.",
    ],

    tips: ["Không thể tự nâng quyền tài khoản."],
  },

  {
    id: "role-catechist",
    category: "Tài khoản & phân quyền",
    title: "Vai trò Huấn luyện viên",

    description:
      "Huấn luyện viên có quyền sử dụng nhiều chức năng quản lý giáo lý.",

    keywords: [
      "huấn luyện viên",
      "quyền huấn luyện viên",
      "catechist",
      "role catechist",
      "giáo lý viên",
      "quyền giáo lý viên",
    ],

    steps: [
      "Tài khoản Huấn luyện viên có quyền sử dụng các chức năng được hệ thống cấp.",
      "Có thể thực hiện nhiều nghiệp vụ quản lý giáo lý tùy cấu hình.",
      "Không được tự thay đổi quyền quản trị cao hơn.",
    ],

    tips: ["Nếu cần thay đổi vai trò, liên hệ quản trị viên có quyền phù hợp."],
  },

  // ============================================================
  // THI & ĐIỂM
  // ============================================================

  {
    id: "exams",
    category: "Thi & điểm",
    title: "Thi và điểm",

    description: "Hướng dẫn quản lý kỳ thi và kết quả học tập.",

    keywords: [
      "thi",
      "kỳ thi",
      "bài thi",
      "điểm",
      "điểm số",
      "kết quả",
      "thi online",
      "thi giấy",
      "exam",
    ],

    steps: [
      "Mở chức năng Thi & điểm.",
      "Chọn kỳ thi hoặc bài thi cần xem.",
      "Kiểm tra danh sách học sinh.",
      "Nhập hoặc xem kết quả theo chức năng được cấp.",
      "Kiểm tra kết quả trước khi hoàn tất.",
    ],

    tips: ["Kiểm tra đúng kỳ thi và lớp trước khi nhập điểm."],
  },

  // ============================================================
  // BÁO CÁO
  // ============================================================

  {
    id: "reports",
    category: "Báo cáo & xuất dữ liệu",
    title: "Báo cáo và xuất dữ liệu",

    description: "Hướng dẫn sử dụng các chức năng báo cáo và xuất dữ liệu.",

    keywords: [
      "báo cáo",
      "report",
      "xuất dữ liệu",
      "export",
      "excel",
      "xuất excel",
      "tải excel",
      "thống kê",
      "dữ liệu",
    ],

    steps: [
      "Mở chức năng báo cáo hoặc danh sách cần xuất.",
      "Thiết lập bộ lọc phù hợp.",
      "Kiểm tra dữ liệu hiển thị.",
      "Chọn chức năng xuất dữ liệu.",
      "Kiểm tra file sau khi tải xuống.",
    ],

    tips: [
      "Luôn kiểm tra bộ lọc trước khi xuất.",
      "Không nên xuất dữ liệu khi chưa xác định đúng phạm vi cần lấy.",
    ],
  },

  // ============================================================
  // CÀI ĐẶT
  // ============================================================

  {
    id: "settings",
    category: "Cài đặt giáo xứ",
    title: "Cài đặt giáo xứ",

    description: "Hướng dẫn các thiết lập chung của giáo xứ.",

    keywords: [
      "cài đặt",
      "cài đặt giáo xứ",
      "thiết lập",
      "settings",
      "cấu hình",
      "cấu hình giáo xứ",
      "điểm danh bật",
      "qr bật",
    ],

    steps: [
      "Mở chức năng Cài đặt giáo xứ.",
      "Kiểm tra các nhóm cấu hình.",
      "Thay đổi thiết lập nếu tài khoản có quyền.",
      "Lưu thay đổi.",
      "Kiểm tra lại chức năng liên quan sau khi cấu hình.",
    ],

    tips: [
      "Không nên thay đổi thiết lập quan trọng nếu chưa hiểu tác động.",
      "Chỉ tài khoản có quyền quản trị mới nên thay đổi cấu hình hệ thống.",
    ],
  },

  // ============================================================
  // XỬ LÝ SỰ CỐ
  // ============================================================

  {
    id: "troubleshooting-login",
    category: "Xử lý sự cố",
    title: "Không đăng nhập được",

    description: "Các bước kiểm tra khi không thể đăng nhập FaithEdu.",

    keywords: [
      "không đăng nhập",
      "đăng nhập không được",
      "sai mật khẩu",
      "mật khẩu",
      "login",
      "login lỗi",
      "tài khoản không vào được",
    ],

    steps: [
      "Kiểm tra lại tên đăng nhập.",
      "Kiểm tra mật khẩu.",
      "Kiểm tra kết nối Internet.",
      "Tải lại trang.",
      "Thử đăng nhập lại.",
      "Nếu vẫn không được, liên hệ quản trị viên giáo xứ.",
    ],

    tips: [
      "Không gửi mật khẩu cho người khác.",
      "Không gửi JWT hoặc mã token cho người hỗ trợ.",
    ],
  },

  {
    id: "troubleshooting-qr",
    category: "Xử lý sự cố",
    title: "Không quét được QR",

    description: "Các bước xử lý khi camera không nhận mã QR.",

    keywords: [
      "qr không quét được",
      "không quét được qr",
      "qr lỗi",
      "camera lỗi",
      "camera không hoạt động",
      "không nhận qr",
      "quét qr lỗi",
    ],

    steps: [
      "Kiểm tra trình duyệt đã được cấp quyền camera chưa.",
      "Kiểm tra camera của thiết bị.",
      "Đảm bảo mã QR đủ rõ và không bị che.",
      "Đưa mã QR vào vùng quét.",
      "Tải lại trang nếu camera không khởi động.",
      "Nếu vẫn không được, thử thiết bị khác.",
    ],

    tips: [
      "Không để mã QR bị mờ hoặc quá nhỏ.",
      "Đảm bảo thiết bị có camera hoạt động.",
    ],
  },

  {
    id: "troubleshooting-general",
    category: "Xử lý sự cố",
    title: "FaithEdu bị lỗi hoặc không phản hồi",

    description:
      "Các bước kiểm tra cơ bản khi hệ thống hoạt động không bình thường.",

    keywords: [
      "lỗi",
      "hệ thống lỗi",
      "faithEdu lỗi",
      "không hoạt động",
      "không phản hồi",
      "trang trắng",
      "website lỗi",
      "không tải được",
      "server lỗi",
    ],

    steps: [
      "Kiểm tra kết nối Internet.",
      "Tải lại trang.",
      "Đăng xuất và đăng nhập lại.",
      "Thử mở lại trình duyệt.",
      "Nếu vẫn lỗi, liên hệ quản trị viên giáo xứ.",
    ],

    tips: [
      "Khi báo lỗi nên cung cấp tên chức năng đang sử dụng và thời điểm xảy ra lỗi.",
      "Không gửi mật khẩu hoặc token khi báo lỗi.",
    ],
  },
];

/**
 * ============================================================
 * GET ALL
 * ============================================================
 */

function getKnowledge() {
  return knowledge;
}

/**
 * ============================================================
 * NORMALIZE TEXT
 * ============================================================
 */

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ============================================================
 * SEARCH KNOWLEDGE
 * ============================================================
 *
 * Trả về kết quả có score.
 */

function searchKnowledge(question) {
  const normalizedQuestion = normalizeText(question);

  if (!normalizedQuestion) {
    return [];
  }

  const questionWords = normalizedQuestion
    .split(" ")
    .filter((word) => word.length >= 2);

  const results = knowledge
    .map((article) => {
      const normalizedTitle = normalizeText(article.title);
      const normalizedDescription = normalizeText(article.description);
      const normalizedCategory = normalizeText(article.category);

      const normalizedKeywords = article.keywords.map((keyword) =>
        normalizeText(keyword),
      );

      let score = 0;
      const matchedKeywords = [];

      /**
       * ======================================================
       * EXACT TITLE
       * ======================================================
       */

      if (normalizedTitle && normalizedQuestion.includes(normalizedTitle)) {
        score += 10;
      }

      /**
       * ======================================================
       * EXACT KEYWORD
       * ======================================================
       */

      for (const keyword of normalizedKeywords) {
        if (!keyword) continue;

        if (normalizedQuestion.includes(keyword)) {
          score += 6;

          matchedKeywords.push(keyword);
        }
      }

      /**
       * ======================================================
       * CATEGORY
       * ======================================================
       */

      if (
        normalizedCategory &&
        normalizedQuestion.includes(normalizedCategory)
      ) {
        score += 4;
      }

      /**
       * ======================================================
       * WORD MATCH
       * ======================================================
       */

      const searchableText = `
        ${normalizedTitle}
        ${normalizedDescription}
        ${normalizedCategory}
        ${normalizedKeywords.join(" ")}
      `;

      for (const word of questionWords) {
        if (searchableText.includes(word)) {
          score += 1;
        }
      }

      return {
        ...article,
        score,
        matchedKeywords,
      };
    })
    .filter((article) => article.score > 0)
    .sort((a, b) => b.score - a.score);

  return results;
}

/**
 * ============================================================
 * GET BEST RESULT
 * ============================================================
 */

function findBestKnowledge(question) {
  const results = searchKnowledge(question);

  if (!results.length) {
    return {
      article: null,
      results: [],
    };
  }

  const best = results[0];

  /**
   * Nếu điểm quá thấp thì không coi là hiểu câu hỏi.
   */
  if (best.score < 4) {
    return {
      article: null,
      results: results.slice(0, 3),
    };
  }

  return {
    article: best,
    results: results.slice(0, 5),
  };
}

module.exports = {
  getKnowledge,
  searchKnowledge,
  findBestKnowledge,
  normalizeText,
};
