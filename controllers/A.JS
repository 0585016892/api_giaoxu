INSERT INTO deaneries
(
    diocese_id,
    code,
    name,
    address,
    phone,
    dean_name,
    is_active,
    description
)
VALUES

-- =========================================================
-- 1. TỔNG GIÁO PHẬN HÀ NỘI - diocese_id = 1
-- =========================================================
(1, 'GH_HN_CHINH_TOA',       'Chính Tòa',          NULL, NULL, NULL, 1, NULL),
(1, 'GH_HN_PHU_XUYEN',       'Phú Xuyên',          NULL, NULL, NULL, 1, NULL),
(1, 'GH_HN_PHU_LY',          'Phủ Lý',             NULL, NULL, NULL, 1, NULL),
(1, 'GH_HN_LY_NHAN',         'Lý Nhân',            NULL, NULL, NULL, 1, NULL),
(1, 'GH_HN_NAM_DINH',        'Nam Định',           NULL, NULL, NULL, 1, NULL),
(1, 'GH_HN_THANH_OAI',       'Thanh Oai',          NULL, NULL, NULL, 1, NULL),
(1, 'GH_HN_MY_DUC_HOA_BINH', 'Mỹ Đức - Hòa Bình', NULL, NULL, NULL, 1, NULL),

-- =========================================================
-- 2. TỔNG GIÁO PHẬN HUẾ - diocese_id = 2
-- =========================================================
(2, 'GH_HUE_TP_HUE',          'Thành Phố Huế',       NULL, NULL, NULL, 1, NULL),
(2, 'GH_HUE_HUONG_PHU',       'Hương Phú',           NULL, NULL, NULL, 1, NULL),
(2, 'GH_HUE_HUONG_QUANG_PHONG','Hương Quảng Phong',  NULL, NULL, NULL, 1, NULL),
(2, 'GH_HUE_HAI_VAN',         'Hải Vân',             NULL, NULL, NULL, 1, NULL),
(2, 'GH_HUE_QUANG_TRI',       'Quảng Trị',           NULL, NULL, NULL, 1, NULL),
(2, 'GH_HUE_TUY_VAN',         'Tuý Vân',             NULL, NULL, NULL, 1, NULL),

-- =========================================================
-- 3. TỔNG GIÁO PHẬN SÀI GÒN - diocese_id = 3
-- =========================================================
(3, 'GH_SG_BINH_AN',          'Bình An',             NULL, NULL, NULL, 1, NULL),
(3, 'GH_SG_CHI_HOA',          'Chí Hòa',             NULL, NULL, NULL, 1, NULL),
(3, 'GH_SG_GIA_DINH',         'Gia Định',            NULL, NULL, NULL, 1, NULL),
(3, 'GH_SG_GO_VAP',           'Gò Vấp',              NULL, NULL, NULL, 1, NULL),
(3, 'GH_SG_HOC_MON',          'Hóc Môn',             NULL, NULL, NULL, 1, NULL),
(3, 'GH_SG_PHU_NHUAN',        'Phú Nhuận',           NULL, NULL, NULL, 1, NULL),
(3, 'GH_SG_PHU_THO',          'Phú Thọ',             NULL, NULL, NULL, 1, NULL),
(3, 'GH_SG_SAI_GON_CHO_QUAN','Sài Gòn - Chợ Quán',  NULL, NULL, NULL, 1, NULL),
(3, 'GH_SG_TAN_DINH',         'Tân Định',            NULL, NULL, NULL, 1, NULL),
(3, 'GH_SG_TAN_SON_NHI',      'Tân Sơn Nhì',         NULL, NULL, NULL, 1, NULL),
(3, 'GH_SG_THU_DUC',          'Thủ Đức',             NULL, NULL, NULL, 1, NULL),
(3, 'GH_SG_THU_THIEM',        'Thủ Thiêm',           NULL, NULL, NULL, 1, NULL),
(3, 'GH_SG_XOM_CHIEU',        'Xóm Chiếu',           NULL, NULL, NULL, 1, NULL),
(3, 'GH_SG_XOM_MOI',          'Xóm Mới',             NULL, NULL, NULL, 1, NULL),

-- =========================================================
-- 4. GIÁO PHẬN LẠNG SƠN - CAO BẰNG - diocese_id = 4
-- =========================================================
(4, 'GH_LS_CB_LANG_SON',      'Lạng Sơn',             NULL, NULL, NULL, 1, NULL),
(4, 'GH_LS_CB_CAO_BANG',      'Cao Bằng',             NULL, NULL, NULL, 1, NULL),
(4, 'GH_LS_CB_HA_GIANG',      'Hà Giang',             NULL, NULL, NULL, 1, NULL),

-- =========================================================
-- 5. GIÁO PHẬN HƯNG HÓA - diocese_id = 5
-- =========================================================
(5, 'GH_HH_DONG_NAM_PHU_THO', 'Đông - Nam Phú Thọ',       NULL, NULL, NULL, 1, NULL),
(5, 'GH_HH_HA_TUYEN_HUNG',    'Hà - Tuyên - Hùng',        NULL, NULL, NULL, 1, NULL),
(5, 'GH_HH_HOA_BINH_SON_LA_DIEN_BIEN',
                              'Hòa Bình - Sơn La - Điện Biên', NULL, NULL, NULL, 1, NULL),
(5, 'GH_HH_LAO_CAI_LAI_CHAU', 'Lào Cai - Lai Châu',       NULL, NULL, NULL, 1, NULL),
(5, 'GH_HH_NGHIA_LO',          'Nghĩa Lộ',                NULL, NULL, NULL, 1, NULL),
(5, 'GH_HH_SON_TAY',            'Sơn Tây',                 NULL, NULL, NULL, 1, NULL),
(5, 'GH_HH_TAY_BAC_PHU_THO',   'Tây - Bắc Phú Thọ',        NULL, NULL, NULL, 1, NULL),
(5, 'GH_HH_TAY_NAM_PHU_THO',   'Tây - Nam Phú Thọ',        NULL, NULL, NULL, 1, NULL),
(5, 'GH_HH_YEN_BAI',            'Yên Bái',                 NULL, NULL, NULL, 1, NULL),

-- =========================================================
-- 6. GIÁO PHẬN BẮC NINH - diocese_id = 6
-- =========================================================
(6, 'GH_BN_TUYEN_QUANG',       'Tuyên Quang',             NULL, NULL, NULL, 1, NULL),
(6, 'GH_BN_THAI_NGUYEN',       'Thái Nguyên',             NULL, NULL, NULL, 1, NULL),
(6, 'GH_BN_TAY_NAM',           'Tây Nam',                 NULL, NULL, NULL, 1, NULL),
(6, 'GH_BN_BAC_GIANG',         'Bắc Giang',               NULL, NULL, NULL, 1, NULL),
(6, 'GH_BN_BAC_NINH',          'Bắc Ninh',                NULL, NULL, NULL, 1, NULL),

-- =========================================================
-- 7. GIÁO PHẬN HẢI PHÒNG - diocese_id = 7
-- =========================================================
(7, 'GH_HP_CHINH_TOA',         'Chính Tòa',               NULL, NULL, NULL, 1, NULL),
(7, 'GH_HP_NAM_AM',            'Nam Am',                  NULL, NULL, NULL, 1, NULL),
(7, 'GH_HP_HON_GAI',           'Hòn Gai',                 NULL, NULL, NULL, 1, NULL),
(7, 'GH_HP_MAO_KHE',           'Mạo Khê',                 NULL, NULL, NULL, 1, NULL),
(7, 'GH_HP_HAI_DUONG',         'Hải Dương',               NULL, NULL, NULL, 1, NULL),
(7, 'GH_HP_KE_SAT',            'Kẻ Sặt',                  NULL, NULL, NULL, 1, NULL),

-- =========================================================
-- 8. GIÁO PHẬN THÁI BÌNH - diocese_id = 8
-- =========================================================
(8, 'GH_TB_CHINH_TOA',         'Chính Tòa',               NULL, NULL, NULL, 1, NULL),
(8, 'GH_TB_DONG_HUNG',         'Đông Hưng',               NULL, NULL, NULL, 1, NULL),
(8, 'GH_TB_KIEN_XUONG',        'Kiến Xương',              NULL, NULL, NULL, 1, NULL),
(8, 'GH_TB_NAM_TIEN_HAI',      'Nam Tiền Hải',             NULL, NULL, NULL, 1, NULL),
(8, 'GH_TB_TAY_HUNG_YEN',      'Tây Hưng Yên',             NULL, NULL, NULL, 1, NULL),
(8, 'GH_TB_THAI_THUY',         'Thái Thụy',               NULL, NULL, NULL, 1, NULL),
(8, 'GH_TB_THANH_PHO',         'Thành Phố',               NULL, NULL, NULL, 1, NULL),
(8, 'GH_TB_HUNG_HA',           'Hưng Hà',                 NULL, NULL, NULL, 1, NULL),

-- =========================================================
-- 9. GIÁO PHẬN BÙI CHU - diocese_id = 9
-- =========================================================
(9, 'GH_BC_BAO_DAP',           'Báo Đáp',                 NULL, NULL, NULL, 1, NULL),
(9, 'GH_BC_BUI_CHU',           'Bùi Chu',                 NULL, NULL, NULL, 1, NULL),
(9, 'GH_BC_CHINH_TOA',         'Chính Tòa',               NULL, NULL, NULL, 1, NULL),
(9, 'GH_BC_HAI_HAU',           'Hải Hậu',                 NULL, NULL, NULL, 1, NULL),
(9, 'GH_BC_LAC_DAO',           'Lạc Đạo',                 NULL, NULL, NULL, 1, NULL),
(9, 'GH_BC_NAM_TRUC',          'Nam Trực',                NULL, NULL, NULL, 1, NULL),
(9, 'GH_BC_NINH_CUONG',        'Ninh Cường',              NULL, NULL, NULL, 1, NULL),
(9, 'GH_BC_PHU_NHAI',          'Phú Nhai',                NULL, NULL, NULL, 1, NULL),
(9, 'GH_BC_QUY_NHAT',          'Quỹ Nhất',                NULL, NULL, NULL, 1, NULL),
(9, 'GH_BC_THUC_THAI',         'Thức Hóa',                NULL, NULL, NULL, 1, NULL),
(9, 'GH_BC_TRUNG_CHINH',       'Trung Chánh',              NULL, NULL, NULL, 1, NULL),
(9, 'GH_BC_VU_BAN',            'Vụ Bản',                  NULL, NULL, NULL, 1, NULL),
(9, 'GH_BC_XUAN_TRUONG',       'Xuân Trường',             NULL, NULL, NULL, 1, NULL),

-- =========================================================
-- 10. GIÁO PHẬN PHÁT DIỆM - diocese_id = 10
-- =========================================================
(10, 'GH_PD_CHINH_TOA',        'Chính Tòa',               NULL, NULL, NULL, 1, NULL),
(10, 'GH_PD_GIAO_THUY',        'Giáo Thủy',               NULL, NULL, NULL, 1, NULL),
(10, 'GH_PD_KIM_SON',          'Kim Sơn',                 NULL, NULL, NULL, 1, NULL),
(10, 'GH_PD_PHAT_DIEM',        'Phát Diệm',               NULL, NULL, NULL, 1, NULL),
(10, 'GH_PD_TAM_DIEP',         'Tam Điệp',                NULL, NULL, NULL, 1, NULL),
(10, 'GH_PD_YEN_KHANH',        'Yên Khánh',               NULL, NULL, NULL, 1, NULL),
(10, 'GH_PD_YEN_MO',           'Yên Mô',                  NULL, NULL, NULL, 1, NULL),
(10, 'GH_PD_NHO_QUAN',         'Nho Quan',                NULL, NULL, NULL, 1, NULL),

-- =========================================================
-- 11. GIÁO PHẬN THANH HÓA - diocese_id = 11
-- =========================================================
(11, 'GH_TH_CHINH_TOA',        'Chính Tòa',               NULL, NULL, NULL, 1, NULL),
(11, 'GH_TH_BA_LANG',          'Ba Làng',                 NULL, NULL, NULL, 1, NULL),
(11, 'GH_TH_BA_THUOC',         'Ba Thước',                NULL, NULL, NULL, 1, NULL),
(11, 'GH_TH_HAM_RONG',         'Hàm Rồng',                NULL, NULL, NULL, 1, NULL),
(11, 'GH_TH_HUU_LE',           'Hữu Lễ',                  NULL, NULL, NULL, 1, NULL),
(11, 'GH_TH_NGA_SON',          'Nga Sơn',                 NULL, NULL, NULL, 1, NULL),
(11, 'GH_TH_PHAT_DIEM',        'Phát Diệm',               NULL, NULL, NULL, 1, NULL),
(11, 'GH_TH_TAM_TONG',         'Tam Tổng',                NULL, NULL, NULL, 1, NULL),

-- =========================================================
-- 12. GIÁO PHẬN VINH - diocese_id = 12
-- =========================================================
(12, 'GH_VINH_CUA_LO',         'Cửa Lò',                  NULL, NULL, NULL, 1, NULL),
(12, 'GH_VINH_DONG_THAP',      'Đông Tháp',               NULL, NULL, NULL, 1, NULL),
(12, 'GH_VINH_PHU_QUY',        'Phủ Quỳ',                 NULL, NULL, NULL, 1, NULL),
(12, 'GH_VINH_VAN_LOC',        'Vạn Lộc',                 NULL, NULL, NULL, 1, NULL),
(12, 'GH_VINH_XA_DOAI',        'Xã Đoài',                 NULL, NULL, NULL, 1, NULL),
(12, 'GH_VINH_TRANG_NUA',      'Trang Nứa',               NULL, NULL, NULL, 1, NULL),

-- =========================================================
-- 13. GIÁO PHẬN HÀ TĨNH - diocese_id = 13
-- =========================================================
(13, 'GH_HT_NGHIA_YEN',        'Nghĩa Yên',               NULL, NULL, NULL, 1, NULL),
(13, 'GH_HT_CAN_LOC',          'Can Lộc',                 NULL, NULL, NULL, 1, NULL),
(13, 'GH_HT_NGAN_PHO',         'Ngàn Phố',                NULL, NULL, NULL, 1, NULL),
(13, 'GH_HT_HUONG_PHO',        'Hương Phố',               NULL, NULL, NULL, 1, NULL),
(13, 'GH_HT_NGAN_SAU',         'Ngàn Sâu',                NULL, NULL, NULL, 1, NULL),
(13, 'GH_HT_VAN_HANH',         'Văn Hạnh',                NULL, NULL, NULL, 1, NULL),
(13, 'GH_HT_TRUNG_NGHIA',      'Trung Nghĩa',              NULL, NULL, NULL, 1, NULL),
(13, 'GH_HT_CAM_XUYEN',        'Cẩm Xuyên',               NULL, NULL, NULL, 1, NULL),
(13, 'GH_HT_KY_ANH',           'Kỳ Anh',                  NULL, NULL, NULL, 1, NULL),
(13, 'GH_HT_BINH_CHINH',       'Bình Chính',               NULL, NULL, NULL, 1, NULL),
(13, 'GH_HT_MINH_CAM',         'Minh Cầm',                NULL, NULL, NULL, 1, NULL),
(13, 'GH_HT_HOA_NINH',         'Hòa Ninh',                NULL, NULL, NULL, 1, NULL),
(13, 'GH_HT_NGUON_SON',        'Nguồn Son',                NULL, NULL, NULL, 1, NULL),
(13, 'GH_HT_TAM_TOA',          'Tam Tòa',                 NULL, NULL, NULL, 1, NULL),

-- =========================================================
-- 14. GIÁO PHẬN ĐÀ NẴNG - diocese_id = 14
-- =========================================================
(14, 'GH_DN_DA_NANG',          'Đà Nẵng',                 NULL, NULL, NULL, 1, NULL),
(14, 'GH_DN_HOA_VANG',         'Hòa Vang',                NULL, NULL, NULL, 1, NULL),
(14, 'GH_DN_HOI_AN',           'Hội An',                  NULL, NULL, NULL, 1, NULL),
(14, 'GH_DN_TRA_KIEU',         'Trà Kiệu',                NULL, NULL, NULL, 1, NULL),
(14, 'GH_DN_TAM_KY',           'Tam Kỳ',                  NULL, NULL, NULL, 1, NULL),

-- =========================================================
-- 15. GIÁO PHẬN QUI NHƠN - diocese_id = 15
-- =========================================================
(15, 'GH_QN_QUI_NHON',         'Qui Nhơn',                 NULL, NULL, NULL, 1, NULL),
(15, 'GH_QN_QUANG_NGAI',       'Quảng Ngãi',               NULL, NULL, NULL, 1, NULL),
(15, 'GH_QN_BINH_DINH',        'Bình Định',                NULL, NULL, NULL, 1, NULL),
(15, 'GH_QN_PHU_YEN',          'Phú Yên',                  NULL, NULL, NULL, 1, NULL),
(15, 'GH_QN_BONG_SON',         'Bồng Sơn',                 NULL, NULL, NULL, 1, NULL),

-- =========================================================
-- 16. GIÁO PHẬN KON TUM - diocese_id = 16
-- =========================================================
(16, 'GH_KT_KON_TUM',          'Kon Tum',                  NULL, NULL, NULL, 1, NULL),
(16, 'GH_KT_PLEIKU',           'Pleiku',                   NULL, NULL, NULL, 1, NULL),
(16, 'GH_KT_MANG_YANG',        'Mang Yang',                NULL, NULL, NULL, 1, NULL),

-- =========================================================
-- 17. GIÁO PHẬN NHA TRANG - diocese_id = 17
-- =========================================================
(17, 'GH_NT_PHAN_RANG',        'Phan Rang',                NULL, NULL, NULL, 1, NULL),
(17, 'GH_NT_NINH_PHUOC',       'Ninh Phước',               NULL, NULL, NULL, 1, NULL),
(17, 'GH_NT_NINH_SON',         'Ninh Sơn',                 NULL, NULL, NULL, 1, NULL),
(17, 'GH_NT_NINH_HAI',         'Ninh Hải',                 NULL, NULL, NULL, 1, NULL),
(17, 'GH_NT_CAM_RANH',         'Cam Ranh',                 NULL, NULL, NULL, 1, NULL),
(17, 'GH_NT_CAM_LAM',          'Cam Lâm',                  NULL, NULL, NULL, 1, NULL),
(17, 'GH_NT_DIEN_KHANH',       'Diên Khánh',               NULL, NULL, NULL, 1, NULL),
(17, 'GH_NT_NHA_TRANG',        'Nha Trang',                NULL, NULL, NULL, 1, NULL),
(17, 'GH_NT_NINH_HOA',         'Ninh Hòa',                 NULL, NULL, NULL, 1, NULL),
(17, 'GH_NT_VAN_NINH',         'Vạn Ninh',                 NULL, NULL, NULL, 1, NULL),

-- =========================================================
-- 18. GIÁO PHẬN BAN MÊ THUỘT - diocese_id = 18
-- =========================================================
(18, 'GH_BMT_CHINH_TOA',       'Chính Tòa',                NULL, NULL, NULL, 1, NULL),
(18, 'GH_BMT_BUON_HO',         'Buôn Hô',                  NULL, NULL, NULL, 1, NULL),
(18, 'GH_BMT_GIANG_SON',       'Giang Sơn',                NULL, NULL, NULL, 1, NULL),
(18, 'GH_BMT_MAU_TAM',         'Mẫu Tâm',                  NULL, NULL, NULL, 1, NULL),
(18, 'GH_BMT_DAK_MIL',         'Đăk Mil',                 NULL, NULL, NULL, 1, NULL),
(18, 'GH_BMT_GIA_NGHIA',       'Gia Nghĩa',                NULL, NULL, NULL, 1, NULL),
(18, 'GH_BMT_DONG_XOAI',       'Đồng Xoài',                NULL, NULL, NULL, 1, NULL),
(18, 'GH_BMT_PHUOC_LONG',      'Phước Long',               NULL, NULL, NULL, 1, NULL),

-- =========================================================
-- 19. GIÁO PHẬN ĐÀ LẠT - diocese_id = 19
-- =========================================================
(19, 'GH_DL_DA_LAT',           'Đà Lạt',                   NULL, NULL, NULL, 1, NULL),
(19, 'GH_DL_BAO_LOC',          'Bảo Lộc',                  NULL, NULL, NULL, 1, NULL),
(19, 'GH_DL_DI_LINH',          'Di Linh',                  NULL, NULL, NULL, 1, NULL),
(19, 'GH_DL_DUC_TRONG',        'Đức Trọng',                NULL, NULL, NULL, 1, NULL),
(19, 'GH_DL_DON_DUONG',        'Đơn Dương',                NULL, NULL, NULL, 1, NULL),
(19, 'GH_DL_DA_TONG',          'Đạ Tông',                  NULL, NULL, NULL, 1, NULL),
(19, 'GH_DL_MADAGUI',          'Madaguôi',                 NULL, NULL, NULL, 1, NULL),

-- =========================================================
-- 20. GIÁO PHẬN PHAN THIẾT - diocese_id = 20
-- =========================================================
(20, 'GH_PT_PHAN_THIET',       'Phan Thiết',                NULL, NULL, NULL, 1, NULL),
(20, 'GH_PT_HAM_TAN',          'Hàm Tân',                   NULL, NULL, NULL, 1, NULL),
(20, 'GH_PT_BAC_TUY',          'Bắc Tuy',                   NULL, NULL, NULL, 1, NULL),
(20, 'GH_PT_HAM_THUAN',       'Hàm Thuận',                NULL, NULL, NULL, 1, NULL),
(20, 'GH_PT_LA_GI',            'La Gi',                    NULL, NULL, NULL, 1, NULL),

-- =========================================================
-- 21. GIÁO PHẬN PHÚ CƯỜNG - diocese_id = 21
-- =========================================================
(21, 'GH_PC_THU_DAU_MOT',      'Thủ Dầu Một',               NULL, NULL, NULL, 1, NULL),
(21, 'GH_PC_LAI_THIEU',        'Lái Thiêu',                 NULL, NULL, NULL, 1, NULL),
(21, 'GH_PC_PHU_CUONG',        'Phú Cường',                 NULL, NULL, NULL, 1, NULL),
(21, 'GH_PC_TRANG_BOM',        'Trảng Bom',                 NULL, NULL, NULL, 1, NULL),
(21, 'GH_PC_TAY_NINH',         'Tây Ninh',                  NULL, NULL, NULL, 1, NULL),
(21, 'GH_PC_BEN_CAT',          'Bến Cát',                   NULL, NULL, NULL, 1, NULL),
(21, 'GH_PC_CHON_THANH',       'Chơn Thành',                NULL, NULL, NULL, 1, NULL),

-- =========================================================
-- 22. GIÁO PHẬN XUÂN LỘC - diocese_id = 22
-- =========================================================
(22, 'GH_XL_BIEN_HOA',         'Biên Hòa',                  NULL, NULL, NULL, 1, NULL),
(22, 'GH_XL_HO_NAI',           'Hố Nai',                    NULL, NULL, NULL, 1, NULL),
(22, 'GH_XL_GIA_KIEM',         'Gia Kiệm',                  NULL, NULL, NULL, 1, NULL),
(22, 'GH_XL_LONG_KHANH',       'Long Khánh',                NULL, NULL, NULL, 1, NULL),
(22, 'GH_XL_GIA_RAY',          'Gia Ray',                   NULL, NULL, NULL, 1, NULL),
(22, 'GH_XL_XUAN_LOC',         'Xuân Lộc',                  NULL, NULL, NULL, 1, NULL),

-- =========================================================
-- 23. GIÁO PHẬN BÀ RỊA - diocese_id = 23
-- =========================================================
(23, 'GH_BR_BA_RIA',           'Bà Rịa',                    NULL, NULL, NULL, 1, NULL),
(23, 'GH_BR_BINH_GIA',         'Bình Giã',                  NULL, NULL, NULL, 1, NULL),
(23, 'GH_BR_LONG_HUONG',       'Long Hương',                NULL, NULL, NULL, 1, NULL),
(23, 'GH_BR_VUNG_TAU',         'Vũng Tàu',                  NULL, NULL, NULL, 1, NULL),
(23, 'GH_BR_XUYEN_MOC',         'Xuyên Mộc',                NULL, NULL, NULL, 1, NULL),

-- =========================================================
-- 24. GIÁO PHẬN MỸ THO - diocese_id = 24
-- =========================================================
(24, 'GH_MT_MY_THO',           'Mỹ Tho',                    NULL, NULL, NULL, 1, NULL),
(24, 'GH_MT_CAI_BE',           'Cái Bè',                   NULL, NULL, NULL, 1, NULL),
(24, 'GH_MT_CAO_LANH',         'Cao Lãnh',                 NULL, NULL, NULL, 1, NULL),
(24, 'GH_MT_CHINH_TOA',        'Chính Tòa',                NULL, NULL, NULL, 1, NULL),
(24, 'GH_MT_GIAO_DUC',         'Gò Công',                  NULL, NULL, NULL, 1, NULL),
(24, 'GH_MT_TAN_AN',           'Tân An',                   NULL, NULL, NULL, 1, NULL),

-- =========================================================
-- 25. GIÁO PHẬN VĨNH LONG - diocese_id = 25
-- =========================================================
(25, 'GH_VL_VINH_LONG',        'Vĩnh Long',                 NULL, NULL, NULL, 1, NULL),
(25, 'GH_VL_BEN_TRE',          'Bến Tre',                  NULL, NULL, NULL, 1, NULL),
(25, 'GH_VL_CAI_MON',          'Cái Mơn',                  NULL, NULL, NULL, 1, NULL),
(25, 'GH_VL_SA_DEC',           'Sa Đéc',                   NULL, NULL, NULL, 1, NULL),
(25, 'GH_VL_TRA_VINH',         'Trà Vinh',                 NULL, NULL, NULL, 1, NULL),
(25, 'GH_VL_MANG_THIT',        'Măng Thít',                NULL, NULL, NULL, 1, NULL),

-- =========================================================
-- 26. GIÁO PHẬN LONG XUYÊN - diocese_id = 26
-- =========================================================
(26, 'GH_LX_LONG_XUYEN',       'Long Xuyên',                NULL, NULL, NULL, 1, NULL),
(26, 'GH_LX_CHAU_DOC',         'Châu Đốc',                  NULL, NULL, NULL, 1, NULL),
(26, 'GH_LX_RACH_GIA',         'Rạch Giá',                  NULL, NULL, NULL, 1, NULL),
(26, 'GH_LX_TRI_TON',          'Tri Tôn',                   NULL, NULL, NULL, 1, NULL),
(26, 'GH_LX_TAN_HIEP',         'Tân Hiệp',                  NULL, NULL, NULL, 1, NULL),
(26, 'GH_LX_THOAI_SON',        'Thoại Sơn',                 NULL, NULL, NULL, 1, NULL),
(26, 'GH_LX_VINH_THANH',       'Vĩnh Thạnh',                 NULL, NULL, NULL, 1, NULL),
(26, 'GH_LX_THAI_BINH',       'Thạnh Hưng',                NULL, NULL, NULL, 1, NULL),
(26, 'GH_LX_TINH_BIEN',        'Tịnh Biên',                 NULL, NULL, NULL, 1, NULL),

-- =========================================================
-- 27. GIÁO PHẬN CẦN THƠ - diocese_id = 27
-- =========================================================
(27, 'GH_CT_CAN_THO',          'Cần Thơ',                   NULL, NULL, NULL, 1, NULL),
(27, 'GH_CT_DAI_HAI',          'Đại Hải',                   NULL, NULL, NULL, 1, NULL),
(27, 'GH_CT_VI_THANH',         'Vị Thanh',                  NULL, NULL, NULL, 1, NULL),
(27, 'GH_CT_SOC_TRANG',        'Sóc Trăng',                 NULL, NULL, NULL, 1, NULL);