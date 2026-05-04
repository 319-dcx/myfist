let images = [];

const uploadBtn = document.getElementById('uploadBtn');
const listDiv = document.getElementById('list');
const previewImg = document.getElementById('previewImg');
const infoDiv = document.getElementById('info');
const analyzeBtn = document.getElementById('analyzeBtn');
const groupBtn = document.getElementById('groupBtn');
const saveCaseBtn = document.getElementById('saveCaseBtn');
const loadCaseBtn = document.getElementById('loadCaseBtn');
const reportBtn = document.getElementById('reportBtn');

// 上传图片
uploadBtn.addEventListener('change', function(e) {
    const files = Array.from(e.target.files);
    files.forEach((file, index) => {
        const id = Date.now() + '-' + index;
        const url = URL.createObjectURL(file);
        
        images.push({
            id: id,
            file: file,
            name: file.name,
            url: url,
            exif: null,
            tamperResult: '未分析'
        });
        
        const div = document.createElement('div');
        div.className = 'image-item';
        div.setAttribute('data-id', id);
        
        const nameSpan = document.createElement('span');
        nameSpan.innerText = file.name;
        nameSpan.style.flex = 1;
        
        const statusSpan = document.createElement('span');
        statusSpan.className = 'status';
        statusSpan.innerText = '未分析';
        
        div.appendChild(nameSpan);
        div.appendChild(statusSpan);
        
        // 点击预览：读取 Exif 并显示（含速度、海拔）
        div.onclick = async () => {
            previewImg.src = url;
            infoDiv.innerText = '正在读取 Exif...';
            if (typeof getExif === 'function') {
                const exifData = await getExif(file);
                if (exifData) {
                    let device = (exifData.make || exifData.model) ? `${exifData.make || ''} ${exifData.model || ''}`.trim() : '未知';
                    let speedText = (exifData.speed !== undefined && exifData.speed !== null) ? exifData.speed + ' km/h' : '无';
                    let altitudeText = (exifData.altitude !== undefined && exifData.altitude !== null) ? exifData.altitude + ' m' : '无';
                    infoDiv.innerHTML = `
                        拍摄时间：${exifData.timeOriginal || '无'}<br>
                        手机型号：${device}<br>
                        经纬度：${exifData.lat ?? '无'}, ${exifData.lng ?? '无'}<br>
                        速度：${speedText}<br>
                        海拔：${altitudeText}
                    `;
                    const target = images.find(img => img.id === id);
                    if (target) target.exif = exifData;
                } else {
                    infoDiv.innerText = '无法读取 Exif（该图片无GPS或时间信息）';
                }
            } else {
                infoDiv.innerText = 'getExif 函数未定义，请检查 myfunctions.js';
            }
        };
        
        listDiv.appendChild(div);
    });
});

// 开始分析
analyzeBtn.addEventListener('click', async () => {
    if (images.length === 0) {
        alert('请先上传图片');
        return;
    }

    const enableTimeCheck = document.getElementById('enableTimeCheck')?.checked || false;

    infoDiv.innerText = '开始分析...';
    const items = document.querySelectorAll('.image-item');
    for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const item = items[i];
        if (!item) continue;
        
        infoDiv.innerText = `正在分析第 ${i+1} / ${images.length} 张...`;
        
        if (!img.exif && typeof getExif === 'function') {
            img.exif = await getExif(img.file);
        }
        
        let result = '正常';
        if (typeof checkTamper === 'function') {
            result = await checkTamper(img, enableTimeCheck);
        } else {
            result = '待集成checkTamper';
        }
        img.tamperResult = result;
        
        const statusSpan = item.querySelector('.status');
        if (statusSpan) {
            statusSpan.innerText = result;
            if (result === '正常') {
                statusSpan.style.backgroundColor = '#c6f7d0';
                statusSpan.style.color = '#2b6e3b';
            } else {
                statusSpan.style.backgroundColor = '#ffe0e0';
                statusSpan.style.color = '#c0392b';
            }
        }
        
        await new Promise(r => setTimeout(r, 200));
    }
    infoDiv.innerText = `分析完成！共 ${images.length} 张图片。`;
});

// 查看分组
groupBtn.addEventListener('click', () => {
    if (images.length === 0) {
        alert('请先上传图片');
        return;
    }
    if (typeof groupByLocation === 'function') {
        const result = groupByLocation(images);
        alert(result);
    } else {
        alert('分组功能待集成 groupByLocation 函数');
    }
});

// 保存案件
saveCaseBtn.addEventListener('click', async () => {
    if (images.length === 0) {
        alert('没有图片可保存，请先上传图片');
        return;
    }
    let caseName = prompt('请输入案件名称', '案件_' + new Date().toISOString().slice(0, 19).replace(/:/g, '-'));
    if (!caseName) return;
    
    if (typeof saveCaseToLocal === 'function') {
        await saveCaseToLocal(caseName, images);
        alert(`案件“${caseName}”已保存`);
    } else {
        alert('保存功能未准备好，请检查 myfunctions.js');
    }
});

// 加载案件
loadCaseBtn.addEventListener('click', async () => {
    if (typeof getCaseListFromLocal !== 'function') {
        alert('加载功能未准备好，请检查 myfunctions.js');
        return;
    }
    const caseList = await getCaseListFromLocal();
    if (!caseList || caseList.length === 0) {
        alert('没有已保存的案件');
        return;
    }
    let listStr = caseList.map((c, idx) => `${idx + 1}. ${c.name}`).join('\n');
    let selected = prompt(`请选择案件编号（1-${caseList.length}）：\n\n${listStr}`);
    if (!selected) return;
    let index = parseInt(selected) - 1;
    if (isNaN(index) || index < 0 || index >= caseList.length) {
        alert('无效选择');
        return;
    }
    const newImages = await loadCaseFromLocal(caseList[index].id);
    if (!newImages) {
        alert('加载失败');
        return;
    }
    // 释放旧 URL
    images.forEach(img => {
        if (img.url) URL.revokeObjectURL(img.url);
    });
    images = newImages;
    renderImageList();
    previewImg.src = '';
    infoDiv.innerText = '点击左侧图片查看Exif信息';
    alert(`加载案件“${caseList[index].name}”成功，共 ${images.length} 张图片`);
});

// 生成报告
reportBtn.addEventListener('click', async () => {
    if (images.length === 0) {
        alert('请先上传图片');
        return;
    }
    if (typeof makeReport !== 'function') {
        alert('报告生成功能未准备好，请检查 myfunctions.js');
        return;
    }
    const caseName = prompt('请输入案件名称', '未命名案件');
    const examiner = prompt('请输入鉴定人姓名', '鉴定人');
    const blob = await makeReport(images, { caseName, examiner });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `取证报告_${caseName}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
});

// 渲染列表（加载案件后使用）
function renderImageList() {
    const listDiv = document.getElementById('list');
    listDiv.innerHTML = '';
    images.forEach((img) => {
        const div = document.createElement('div');
        div.className = 'image-item';
        div.setAttribute('data-id', img.id);
        
        const nameSpan = document.createElement('span');
        nameSpan.innerText = img.name;
        nameSpan.style.flex = '1';
        
        const statusSpan = document.createElement('span');
        statusSpan.className = 'status';
        statusSpan.innerText = img.tamperResult || '未分析';
        
        if (img.tamperResult === '正常') {
            statusSpan.style.backgroundColor = '#c6f7d0';
            statusSpan.style.color = '#2b6e3b';
        } else if (img.tamperResult && img.tamperResult !== '未分析') {
            statusSpan.style.backgroundColor = '#ffe0e0';
            statusSpan.style.color = '#c0392b';
        } else {
            statusSpan.style.backgroundColor = '#e2e8f0';
        }
        
        div.appendChild(nameSpan);
        div.appendChild(statusSpan);
        
        // 点击预览：使用 img 对象中的 exif 数据（注意使用 img.url 和 img.file）
        div.onclick = async () => {
            previewImg.src = img.url;
            infoDiv.innerText = '正在读取 Exif...';
            // 如果还没有 exif，先解析
            let exifData = img.exif;
            if (!exifData && img.file && typeof getExif === 'function') {
                exifData = await getExif(img.file);
                if (exifData) img.exif = exifData;
            }
            if (exifData) {
                let device = (exifData.make || exifData.model) ? `${exifData.make || ''} ${exifData.model || ''}`.trim() : '未知';
                let speedText = (exifData.speed !== undefined && exifData.speed !== null) ? exifData.speed + ' km/h' : '无';
                let altitudeText = (exifData.altitude !== undefined && exifData.altitude !== null) ? exifData.altitude + ' m' : '无';
                infoDiv.innerHTML = `
                    拍摄时间：${exifData.timeOriginal || '无'}<br>
                    手机型号：${device}<br>
                    经纬度：${exifData.lat ?? '无'}, ${exifData.lng ?? '无'}<br>
                    速度：${speedText}<br>
                    海拔：${altitudeText}
                `;
            } else {
                infoDiv.innerText = '无Exif信息';
            }
        };
        
        listDiv.appendChild(div);
    });
}

// ==================== 轨迹绘制功能 ====================
let trackMap = null;
let trackLayer = null;

function initMap() {
    const mapContainer = document.getElementById('mapContainer');
    mapContainer.style.display = 'block';
    if (trackMap === null) {
        trackMap = L.map('trackMap').setView([39.9042, 116.4074], 12);
        L.tileLayer('https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
            attribution: '&copy; <a href="https://www.amap.com/">高德地图</a>',
            maxZoom: 18
        }).addTo(trackMap);
    }
    return trackMap;
}

function drawTrack(points) {
    if (!points || points.length < 2) {
        alert("轨迹点不足（至少需要2个点），无法绘制。");
        return;
    }
    const map = initMap();
    if (trackLayer) map.removeLayer(trackLayer);
    const latlngs = points.map(p => [p.lat, p.lng]);
    trackLayer = L.polyline(latlngs, { color: 'red', weight: 4 }).addTo(map);
    map.fitBounds(trackLayer.getBounds());
    points.forEach(p => {
        L.marker([p.lat, p.lng]).bindPopup(`时间: ${p.time}`).addTo(map);
    });
}

function generateTrackPointsFromImages() {
    const points = [];
    for (let img of images) {
        if (img.exif && img.exif.lat && img.exif.lng && img.exif.timeOriginal) {
            points.push({
                lat: img.exif.lat,
                lng: img.exif.lng,
                time: img.exif.timeOriginal,
                name: img.name
            });
        }
    }
    points.sort((a, b) => new Date(a.time) - new Date(b.time));
    return points;
}

function testTrack() {
    const mockPoints = [
        { lat: 39.9042, lng: 116.4074, time: "2024-03-15 14:30:00" },
        { lat: 39.9150, lng: 116.4200, time: "2024-03-15 14:45:00" },
        { lat: 39.9100, lng: 116.4350, time: "2024-03-15 15:00:00" }
    ];
    drawTrack(mockPoints);
}

document.getElementById('trackBtn').addEventListener('click', () => {
    let points = generateTrackPointsFromImages();
    if (points.length >= 2) {
        drawTrack(points);
    } else {
        if (confirm("当前图片中有效 GPS 点不足2个，是否使用演示数据查看轨迹效果？")) {
            testTrack();
        } else {
            alert("请上传包含 GPS 信息的图片（至少2张不同地点）后重试。");
        }
    }
});



// ==================== AI 分析报告 ====================
const AI_API_KEY = "sk-1dfe3915a14d4e8b80d6120c92789dda";

async function aiAnalyzeReport() {
    if (!images.length) {
        alert("请先上传图片");
        return;
    }
    if (!images.some(img => img.tamperResult && img.tamperResult !== "未分析")) {
        alert("请先点击「开始分析」");
        return;
    }

    const caseInfo = {
        caseName: "AI分析案件",
        examiner: "AI辅助鉴定"
    };
    const reportBlob = await makeReport(images, caseInfo);
    const reportText = await reportBlob.text();

    const infoDiv = document.getElementById("info");
    const originalContent = infoDiv.innerHTML;
    infoDiv.innerHTML = originalContent + "<p style='color:blue;'>🤖 AI 正在分析报告，请稍候...</p >";

    try {
        const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${AI_API_KEY}`
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    { role: "system", content: "你是图片取证分析专家。" },
                    { role: "user", content: `请分析以下取证报告，给出可疑点总结和建议：\n\n${reportText.substring(0, 6000)}` }
                ],
                temperature: 0.7,
                max_tokens: 1500
            })
        });

        const data = await res.json();
        const aiResult = data.choices[0].message.content;

        infoDiv.innerHTML = originalContent + `
            <div style="margin-top:20px; background:#e6f3ff; padding:15px; border-left:5px solid #1a3a5c;">
                <b>🤖 AI 分析结论</b><br/>
                <div style="white-space:pre-wrap;">${aiResult.replace(/\n/g, "<br/>")}</div>
                <hr/>
                <span style="color:gray; font-size:0.8em;">⚠️ AI 分析仅供参考，最终结论需人工确认</span>
            </div>
        `;
    } catch (err) {
        infoDiv.innerHTML = originalContent + `<p style="color:red;">❌ AI 分析失败：${err.message}</p >`;
    }
}

document.getElementById("aiReportBtn").addEventListener("click", aiAnalyzeReport);

// 绑定按钮事件
document.getElementById("aiAnalyzeBtn")?.addEventListener("click", aiAnalyzeReport);