// ==================== 第一周：读取EXIF信息 ====================
async function getExif(file) {
    try {
        let data = await exifr.parse(file);
        if (!data) return null;
        
        let timeOriginal = data.DateTimeOriginal || data.DateTime || data.ModifyDate || null;
        if (timeOriginal && typeof timeOriginal === 'object' && timeOriginal.toISOString) {
            timeOriginal = timeOriginal.toLocaleString();
        }
        let lat = data.latitude ?? data.GPSLatitude ?? null;
        let lng = data.longitude ?? data.GPSLongitude ?? null;
        
        if (lat === null && data.GPSLatitude) {
            const toDecimal = (coord, ref) => {
                if (!coord) return null;
                if (typeof coord === 'number') return coord;
                if (Array.isArray(coord) && coord.length >= 3) {
                    let decimal = coord[0] + coord[1]/60 + coord[2]/3600;
                    if (ref === 'S' || ref === 'W') decimal = -decimal;
                    return decimal;
                }
                return null;
            };
            lat = toDecimal(data.GPSLatitude, data.GPSLatitudeRef);
            lng = toDecimal(data.GPSLongitude, data.GPSLongitudeRef);
        }
        
        return { timeOriginal, lat, lng };
    } catch (error) {
        console.error("解析出错:", error);
        return null;
    }
}

// ==================== ELA检测（PS痕迹检测） ====================
async function detectPS(file) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            
            const lowQualityDataUrl = canvas.toDataURL('image/jpeg', 0.5);
            const tempImg = new Image();
            
            tempImg.onload = () => {
                const canvas2 = document.createElement('canvas');
                canvas2.width = img.width;
                canvas2.height = img.height;
                const ctx2 = canvas2.getContext('2d');
                ctx2.drawImage(tempImg, 0, 0);
                
                const imgData1 = ctx.getImageData(0, 0, img.width, img.height);
                const imgData2 = ctx2.getImageData(0, 0, img.width, img.height);
                const data1 = imgData1.data;
                const data2 = imgData2.data;
                
                let totalDiff = 0;
                let maxDiff = 0;
                for (let i = 0; i < data1.length; i += 4) {
                    const diff = Math.abs(data1[i] - data2[i]) + 
                                 Math.abs(data1[i+1] - data2[i+1]) + 
                                 Math.abs(data1[i+2] - data2[i+2]);
                    totalDiff += diff;
                    if (diff > maxDiff) maxDiff = diff;
                }
                const avgDiff = totalDiff / (data1.length / 4);
                const isSuspicious = avgDiff > 18 && maxDiff > 45;
                
                resolve({ isSuspicious, avgDiff, maxDiff });
            };
            tempImg.src = lowQualityDataUrl;
        };
        img.src = URL.createObjectURL(file);
    });
}

// ==================== 篡改检测 ====================
async function checkTamper(imgObj) {
    let exif = imgObj.exif;
    let file = imgObj.file;
    let suspicions = [];

    if (!exif) {
        suspicions.push("无EXIF信息");
        suspicions.push("无拍摄时间");
        suspicions.push("无GPS定位");
    } else {
        if (!exif.timeOriginal) suspicions.push("无拍摄时间");
        if (!exif.lat || !exif.lng) suspicions.push("无GPS定位");
        
        if (exif.timeOriginal && file && file.lastModified) {
            let shootTime = new Date(exif.timeOriginal).getTime();
            let fileTime = file.lastModified;
            let diffHours = Math.abs(shootTime - fileTime) / (1000 * 60 * 60);
            if (diffHours > 1) {
                suspicions.push(`拍摄时间与文件时间相差${diffHours.toFixed(1)}小时`);
            }
        }
    }

    try {
        let elaResult = await detectPS(file);
        if (elaResult.isSuspicious) {
            suspicions.push(`ELA检测到PS痕迹 (平均差异=${elaResult.avgDiff.toFixed(1)}, 最大差异=${elaResult.maxDiff.toFixed(0)})`);
        }
    } catch(e) {
        console.error("ELA检测失败:", e);
    }

    let unique = [...new Set(suspicions)];
    return unique.length === 0 ? "正常" : "可疑：" + unique.join("、");
}

// ==================== 位置分组 ====================
function groupByLocation(images) {
    let groups = {};
    let groupIndex = 0;
    let noGpsList = [];

    images.forEach((img) => {
        let exif = img.exif;
        if (exif && exif.lat && exif.lng) {
            let latKey = exif.lat.toFixed(2);
            let lngKey = exif.lng.toFixed(2);
            let key = `${latKey},${lngKey}`;
            if (!groups[key]) {
                groupIndex++;
                groups[key] = { name: `组${groupIndex}`, images: [] };
            }
            groups[key].images.push(img.name);
        } else {
            noGpsList.push(img.name);
        }
    });

    let result = [];
    for (let key in groups) {
        result.push(`${groups[key].name}: ${groups[key].images.join(", ")}`);
    }
    if (noGpsList.length) {
        result.push(`\n无GPS信息的图片：${noGpsList.join(", ")}`);
    }
    return result.length ? result.join("\n") : "没有找到任何图片";
}

// ==================== 生成报告（纯文本） ====================
async function makeReport(images, caseInfo = {}) {
    let caseName = caseInfo.caseName || "未命名案件";
    let examiner = caseInfo.examiner || "未填写";
    let reportDate = new Date().toLocaleString();
    
    let totalCount = images.length;
    let normalCount = 0;
    let suspiciousCount = 0;
    let noGpsCount = 0;
    let noExifCount = 0;
    let psDetectedCount = 0;
    
    let reportLines = [];
    reportLines.push("╔══════════════════════════════════════════════════════════════╗");
    reportLines.push("║                   图片取证分析报告                           ║");
    reportLines.push("╚══════════════════════════════════════════════════════════════╝");
    reportLines.push("");
    reportLines.push("【案件信息】");
    reportLines.push("案件名称：" + caseName);
    reportLines.push("鉴定人：" + examiner);
    reportLines.push("报告日期：" + reportDate);
    reportLines.push("");
    reportLines.push("【检材清单】");
    reportLines.push("┌────┬────────────────────────┬──────────────────┬──────────────┬─────────────┐");
    reportLines.push("│编号│ 文件名                  │ 拍摄时间          │ GPS定位      │ 鉴定结果    │");
    reportLines.push("├────┼────────────────────────┼──────────────────┼──────────────┼─────────────┤");
    
    for (let i = 0; i < images.length; i++) {
        let img = images[i];
        let status = img.tamperResult || "未分析";
        
        if (status === "正常") normalCount++;
        else {
            suspiciousCount++;
            if (status.includes("无GPS")) noGpsCount++;
            if (status.includes("无EXIF")) noExifCount++;
            if (status.includes("ELA")) psDetectedCount++;
        }
        
        let fileName = img.name.length > 20 ? img.name.substring(0, 17) + "..." : img.name;
        let shootTime = img.exif?.timeOriginal || "无";
        let gps = (img.exif?.lat && img.exif?.lng) ? `${img.exif.lat},${img.exif.lng}` : "无";
        let resultIcon = status === "正常" ? "正常" : "可疑";
        
        reportLines.push(`│${String(i+1).padStart(2)}   │ ${fileName.padEnd(22)}│ ${shootTime.padEnd(16)}│ ${gps.padEnd(12)}│ ${resultIcon.padEnd(11)}│`);
        if (i < images.length - 1) reportLines.push("├────┼────────────────────────┼──────────────────┼──────────────┼─────────────┤");
    }
    
    reportLines.push("└────┴────────────────────────┴──────────────────┴──────────────┴─────────────┘");
    reportLines.push("");
    reportLines.push("【统计摘要】");
    reportLines.push("检材总数：" + totalCount + " 张");
    reportLines.push("├─ 正常图片：" + normalCount + " 张");
    reportLines.push("└─ 可疑图片：" + suspiciousCount + " 张");
    if (suspiciousCount > 0) {
        reportLines.push("    ├─ 无EXIF信息：" + noExifCount + " 张");
        reportLines.push("    ├─ 无GPS定位：" + noGpsCount + " 张");
        reportLines.push("    └─ ELA检测异常：" + psDetectedCount + " 张");
    }
    reportLines.push("");
    reportLines.push("【位置分组结果】");
    let groupResult = groupByLocation(images);
    reportLines.push(groupResult);
    reportLines.push("");
    reportLines.push("【详细鉴定意见】");
    for (let i = 0; i < images.length; i++) {
        let img = images[i];
        let status = img.tamperResult || "未分析";
        reportLines.push("");
        reportLines.push(`● 图片${i+1}：${img.name}`);
        reportLines.push(`   鉴定结果：${status === "正常" ? "正常" : "可疑"}`);
        if (status !== "正常") {
            reportLines.push(`   可疑原因：${status}`);
        }
        if (img.exif?.timeOriginal) {
            reportLines.push(`   拍摄时间：${img.exif.timeOriginal}`);
        }
        if (img.exif?.lat && img.exif?.lng) {
            reportLines.push(`   GPS定位：${img.exif.lat}, ${img.exif.lng}`);
        }
        reportLines.push("");
    }
    
    reportLines.push("【鉴定结论】");
    if (suspiciousCount === 0) {
        reportLines.push(`经对 ${totalCount} 张涉案图片进行数字取证分析，未发现篡改痕迹，所有图片鉴定为正常。`);
    } else {
        reportLines.push(`经对 ${totalCount} 张涉案图片进行数字取证分析，发现 ${suspiciousCount} 张图片存在可疑特征，建议进一步人工鉴定。`);
    }
    reportLines.push("");
    reportLines.push("鉴定人：" + examiner);
    reportLines.push("报告日期：" + reportDate);
    reportLines.push("");
    reportLines.push("【免责声明】");
    reportLines.push("本报告仅基于所提供的电子数据进行分析，分析结论受限于数据完整性。");
    
    let content = reportLines.join("\n");
    let blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    return blob;
}

// ==================== 第三周：案件存储（IndexedDB，支持图片预览） ====================
const DB_NAME = 'ImageForensicsDB';
const DB_VERSION = 1;
const STORE_NAME = 'cases';

// 打开数据库
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('name', 'name');
            }
        };
    });
}

// 保存案件（完整保存图片 File 对象）
async function saveCaseToLocal(caseName, images) {
    const db = await openDB();
    const id = 'case_' + Date.now() + '_' + caseName;
    const imagesToSave = images.map(img => ({
        name: img.name,
        file: img.file,          // File 对象可直接存入 IndexedDB
        exif: img.exif,
        tamperResult: img.tamperResult
    }));
    const caseData = { id, name: caseName, images: imagesToSave, savedAt: Date.now() };
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(caseData);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(true);
    });
}

// 获取案件列表
async function getCaseListFromLocal() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const allCases = request.result;
            resolve(allCases.map(c => ({ id: c.id, name: c.name })));
        };
    });
}

// 加载指定案件（恢复完整的图片对象，包含预览 URL）
async function loadCaseFromLocal(caseId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(caseId);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const caseData = request.result;
            if (!caseData) {
                resolve(null);
                return;
            }
            // 恢复完整的图片对象：重新生成 blob URL
            const images = caseData.images.map((img, idx) => {
                const url = URL.createObjectURL(img.file);
                return {
                    id: Date.now() + '-' + idx,
                    name: img.name,
                    file: img.file,
                    url: url,
                    exif: img.exif,
                    tamperResult: img.tamperResult
                };
            });
            resolve(images);
        };
    });
}