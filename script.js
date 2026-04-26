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
        
        // 点击预览：读取 Exif 并显示（含手机型号）
        div.onclick = async () => {
            previewImg.src = url;
            infoDiv.innerText = '正在读取 Exif...';
            if (typeof getExif === 'function') {
                const exifData = await getExif(file);
                if (exifData) {
                    // 手机型号
                    let device = '';
                    if (exifData.make || exifData.model) {
                        device = `${exifData.make || ''} ${exifData.model || ''}`.trim();
                    } else {
                        device = '未知';
                    }
                    infoDiv.innerHTML = `
                        拍摄时间：${exifData.timeOriginal || '无'}<br>
                        手机型号：${device}<br>
                        经纬度：${exifData.lat ?? '无'}, ${exifData.lng ?? '无'}
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

    // ❶ 获取复选框状态（新增）
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
            // ❷ 将复选框状态传入 checkTamper（新增第二个参数）
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

// 渲染列表
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
        
        div.onclick = () => {
            if (img.url) {
                previewImg.src = img.url;
            } else {
                previewImg.src = '';
                infoDiv.innerText = '图片文件未保存，请重新上传';
                return;
            }
            if (img.exif) {
                let device = '';
                if (img.exif.make || img.exif.model) {
                    device = `${img.exif.make || ''} ${img.exif.model || ''}`.trim();
                } else {
                    device = '未知';
                }
                infoDiv.innerHTML = `
                    拍摄时间：${img.exif.timeOriginal || '无'}<br>
                    手机型号：${device}<br>
                    经纬度：${img.exif.lat ?? '无'}, ${img.exif.lng ?? '无'}
                `;
            } else {
                infoDiv.innerText = '无Exif信息';
            }
        };
        
        listDiv.appendChild(div);
    });
}