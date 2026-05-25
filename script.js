// =============================================================================
// 跨境电商美客多（MercadoLibre）巴西站利润计算器
// 功能：输入产品成本、售价、运费、费率等参数，自动计算单件毛利、毛利率及备货统计
// 计算逻辑说明：
//   1. 头程费 = (长×宽×高 / 系数) × 体积重运价 / 装箱数
//      - 系数5100(普货)/6100(灰清)用于将体积转为"体积重KG"
//      - 体积重KG再乘以每KG运价得到头程成本
//   2. 平台费用 = 售价 × (佣金率 + 广告率 + 税点)
//   3. 末端费用 = 操作费 + 尾程费 + 其他杂费（单位：BRL）
//   4. 总成本 = (平台费用 + 末端费用) × 汇率 + 产品单价 + 头程费
//   5. 毛利 = 售价 × 汇率 - 总成本
//   6. 毛利率 = 毛利 / (售价 × 汇率)
// =============================================================================

// -------------------------------------------------------------------------
// 第一部分：获取DOM元素引用
// -------------------------------------------------------------------------

// 基础尺寸输入
const lengthInput = document.getElementById('length');          // 长 (cm)
const widthInput = document.getElementById('width');             // 宽 (cm)
const heightInput = document.getElementById('height');           // 高 (cm)
const packQtyInput = document.getElementById('packQty');         // 装箱数 (PCS/箱)
const boxWeightInput = document.getElementById('boxWeight');     // 箱毛重 (kg)
const productCostInput = document.getElementById('productCost'); // 产品单价 (RMB)
const sellPriceInput = document.getElementById('sellPrice');    // 预计售价 (BRL)
const shippingTypeSelect = document.getElementById('shippingType'); // 头程方式 (普货/灰清)

// 费率输入 (百分比)
const commissionRateInput = document.getElementById('commissionRate'); // 佣金率 (%)
const adRateInput = document.getElementById('adRate');           // 广告费率 (%)
const taxRateInput = document.getElementById('taxRate');         // 预估税点 (%)
const exchangeRateInput = document.getElementById('exchangeRate'); // 汇率 (RMB/BRL)

// 末端费用输入 (BRL巴西雷亚尔)
const operationFeeInput = document.getElementById('operationFee');   // 操作费+出库费
const lastMileFeeInput = document.getElementById('lastMileFee');     // 尾程配送费
const otherFeeInput = document.getElementById('otherFee');           // 其他杂费

// 备货量输入
const stockQtyInput = document.getElementById('stockQty');       // 备货量 (PCS)

// -------------------------------------------------------------------------
// 第二部分：结果显示元素
// -------------------------------------------------------------------------
const headFeeDisplay = document.getElementById('headFeeDisplay');     // 单件体积重头程费
const unitWeightDisplay = document.getElementById('unitWeightDisplay'); // 单件重量 (kg)
const unitVolDisplay = document.getElementById('unitVolDisplay');     // 单件体积 (m³)
const totalRevenue = document.getElementById('totalRevenue');         // 人民币总收入 (单件)
const platformFeeBRL = document.getElementById('platformFeeBRL');     // 平台费用小计 (BRL)
const lastmileTotal = document.getElementById('lastmileTotal');       // 末端总费用 BRL→RMB
const totalCostSpan = document.getElementById('totalCost');           // 单件总成本 (RMB)
const grossProfitSpan = document.getElementById('grossProfit');       // 单件毛利 (RMB)
const marginRateSpan = document.getElementById('marginRate');         // 毛利率
const totalStockValueSpan = document.getElementById('totalStockValue'); // 备货总货值 (RMB)
const totalCBMSpan = document.getElementById('totalCBM');            // 总体积 (CBM)
const totalBoxesSpan = document.getElementById('totalBoxes');        // 总箱数

// -------------------------------------------------------------------------
// 第三部分：常量定义
// -------------------------------------------------------------------------

/**
 * 体积重系数（用于将体积 cm³ 转换为体积重 KG）
 * - 普货(普货渠道)：5100，即 1m³ = 167kg（实际体积重）
 * - 灰清(灰清渠道)：6100，即 1m³ = 200kg（体积重更大）
 * 公式：体积重(KG) = 长×宽×高(cm³) / 系数
 */
const DENSITY_PUHUO = 5100;      // 普货体积重系数
const DENSITY_HUIQING = 6100;    // 灰清体积重系数

/**
 * 体积转换常数：cm³ → m³
 * 1 m³ = 100cm × 100cm × 100cm = 1,000,000 cm³
 */
const VOL_CONV = 1000000;

// -------------------------------------------------------------------------
// 第四部分：辅助函数
// -------------------------------------------------------------------------

/**
 * 获取输入框的浮点数值
 * @param {string} id - HTML元素的ID
 * @returns {number} 输入值，空白或无效时返回0
 */
function getFloat(id) {
    let val = document.getElementById(id).value;
    if (val === '' || val === null) return 0;
    return parseFloat(val);
}

/**
 * 获取输入框的整数值
 * @param {string} id - HTML元素的ID
 * @returns {number} 输入值，空白或无效时返回0
 */
function getInt(id) {
    let val = document.getElementById(id).value;
    return parseInt(val) || 0;
}

// -------------------------------------------------------------------------
// 第五部分：核心计算逻辑
// -------------------------------------------------------------------------

/**
 * 执行所有利润计算并更新UI显示
 * 计算顺序：
 *   1. 单件重量 → 2. 单件体积 → 3. 头程费 → 4. 平台费用
 *   → 5. 末端费用 → 6. 总成本 → 7. 收入 → 8. 毛利 → 9. 备货统计
 */
function computeAll() {
    // -----------------------------------------------------------------
    // 步骤1：读取用户输入的基础数据
    // -----------------------------------------------------------------
    const L = getFloat('length');                 // 长 (cm)
    const W = getFloat('width');                   // 宽 (cm)
    const H = getFloat('height');                  // 高 (cm)
    const packQty = getFloat('packQty');           // 装箱数 (PCS/箱)
    const boxWeight = getFloat('boxWeight');       // 箱毛重 (kg)
    const productUnitPrice = getFloat('productCost');  // 产品单价 (RMB)
    const sellingPriceBRL = getFloat('sellPrice'); // 预计售价 (BRL)
    const shippingType = shippingTypeSelect.value; // 头程方式："普货" 或 "灰清"

    // -----------------------------------------------------------------
    // 步骤2：读取费率参数（百分比转为小数）
    // -----------------------------------------------------------------
    // 注意：用户输入的是百分比(如16.5)，需除以100转为小数(如0.165)
    let commission = getFloat('commissionRate') / 100;  // 佣金率
    let ad = getFloat('adRate') / 100;                  // 广告费率
    let tax = getFloat('taxRate') / 100;               // 税点
    let exchangeRate = getFloat('exchangeRate');       // 汇率 (RMB/BRL)

    // -----------------------------------------------------------------
    // 步骤3：读取末端费用（单位：BRL巴西雷亚尔）
    // -----------------------------------------------------------------
    let opFee = getFloat('operationFee');        // 操作费+出库费
    let lastMile = getFloat('lastMileFee');      // 尾程配送费
    let otherLocal = getFloat('otherFee');       // 其他杂费
    // 末端总费用 = 三项费用之和（单位：BRL）
    let totalLocalEndFee = opFee + lastMile + otherLocal;

    // -----------------------------------------------------------------
    // 步骤4：读取备货量
    // -----------------------------------------------------------------
    let stockQty = getFloat('stockQty');

    // -----------------------------------------------------------------
    // 步骤5：有效性校验（防止除零错误）
    // -----------------------------------------------------------------
    if (packQty <= 0) return;  // 装箱数必须大于0
    if (L <= 0 || W <= 0 || H <= 0) return;  // 长宽高必须大于0

    // =================================================================
    // 以下开始计算各项指标
    // =================================================================

    // -----------------------------------------------------------------
    // 计算1：单件重量 (kg)
    // 公式：箱毛重 / 装箱数 = 单件重量
    // -----------------------------------------------------------------
    const unitWeight = boxWeight / packQty;
    unitWeightDisplay.innerText = unitWeight.toFixed(2) + ' kg';

    // -----------------------------------------------------------------
    // 计算2：单件体积 (m³) - 仅用于展示
    // 公式：(长 × 宽 × 高) / 1,000,000 = 体积 m³
    // -----------------------------------------------------------------
    const singleVolumeM3 = (L * W * H) / VOL_CONV;
    unitVolDisplay.innerText = singleVolumeM3.toFixed(5) + ' m³';

    // -----------------------------------------------------------------
    // 计算3：头程费（体积重头程，单件人民币）
    // 
    // 计算逻辑：
    //   步骤A：将cm³体积转为体积重KG
    //          体积重KG = 长×宽×高 / 系数(5100或6100)
    //   步骤B：体积重KG再除以装箱数 = 单件体积重KG
    //   步骤C：头程费RMB = 单件体积重KG × 运价系数
    //          （此处简化为直接除以系数，实际上还需要×每KG运价）
    // 
    // 公式：头程费 = (长×宽×高 × 系数) / 1,000,000 / 装箱数
    // -----------------------------------------------------------------
    const volumeCm = L * W * H;  // 总体积 cm³
    let headFee = 0;
    if (shippingType === '普货') {
        // 普货渠道：使用5100系数（体积重相对较小）
        headFee = (volumeCm * DENSITY_PUHUO) / VOL_CONV / packQty;
    } else {
        // 灰清渠道：使用6100系数（体积重相对较大）
        headFee = (volumeCm * DENSITY_HUIQING) / VOL_CONV / packQty;
    }
    // ⚠️ 注意：此处headFee单位是RMB，但显示中误用了R$符号（为保持原样式未修改）
    headFeeDisplay.innerText = 'R$ ' + headFee.toFixed(2) + ' (RMB)';

    // -----------------------------------------------------------------
    // 计算4：平台费用（佣金+广告+税点，基于售价 BRL）
    // 公式：平台费用BRL = 售价BRL × (佣金率 + 广告率 + 税点)
    // -----------------------------------------------------------------
    const totalRate = commission + ad + tax;  // 总费率
    const platformFeeBRLValue = sellingPriceBRL * totalRate;
    platformFeeBRL.innerText = 'R$ ' + platformFeeBRLValue.toFixed(2) + ' BRL';

    // -----------------------------------------------------------------
    // 计算5：末端总费用转换为人民币
    // 公式：末端费用RMB = 末端费用BRL × 汇率
    // -----------------------------------------------------------------
    const localEndFeeRMB = totalLocalEndFee * exchangeRate;
    // ⚠️ 注意：此处RMB金额误用了R$符号（为保持原样式未修改）
    lastmileTotal.innerText = 'R$ ' + localEndFeeRMB.toFixed(2) + ' RMB  (合计' + totalLocalEndFee.toFixed(2) + ' BRL)';

    // -----------------------------------------------------------------
    // 计算6：单件总成本（人民币）
    // 
    // 成本构成：
    //   A. 平台费用折合RMB = 平台费用BRL × 汇率
    //   B. 末端费用RMB = 末端费用BRL × 汇率
    //   C. 产品单价RMB = 采购成本
    //   D. 头程费RMB = 体积重运费
    // 
    // 公式：总成本 = 平台费用RMB + 末端费用RMB + 产品单价 + 头程费
    // -----------------------------------------------------------------
    const platformFeeRMB = platformFeeBRLValue * exchangeRate;
    const totalCostPerUnit = platformFeeRMB + localEndFeeRMB + productUnitPrice + headFee;
    totalCostSpan.innerText = '¥ ' + totalCostPerUnit.toFixed(2);

    // -----------------------------------------------------------------
    // 计算7：单件总收入（人民币）
    // 公式：收入RMB = 售价BRL × 汇率
    // -----------------------------------------------------------------
    const revenuePerUnitRMB = sellingPriceBRL * exchangeRate;
    totalRevenue.innerText = '¥ ' + revenuePerUnitRMB.toFixed(2);

    // -----------------------------------------------------------------
    // 计算8：毛利 & 毛利率
    // 
    // 毛利 = 收入 - 成本
    //      = 售价×汇率 - [(平台费用+末端费用)×汇率 + 产品单价 + 头程费]
    // 
    // 毛利率 = 毛利 / 收入 × 100%
    // -----------------------------------------------------------------
    const grossProfitVal = revenuePerUnitRMB - totalCostPerUnit;
    grossProfitSpan.innerText = '¥ ' + grossProfitVal.toFixed(2);

    // 毛利率计算（防止除零）
    let margin = 0;
    if (revenuePerUnitRMB > 0) {
        margin = (grossProfitVal / revenuePerUnitRMB) * 100;
    }
    marginRateSpan.innerText = margin.toFixed(2) + '%';

    // 根据毛利正负设置颜色（绿色=盈利，红色=亏损）
    if (grossProfitVal >= 0) {
        grossProfitSpan.classList.add('profit-positive');
        grossProfitSpan.classList.remove('profit-negative');
        marginRateSpan.classList.add('profit-positive');
        marginRateSpan.classList.remove('profit-negative');
    } else {
        grossProfitSpan.classList.remove('profit-positive');
        grossProfitSpan.classList.add('profit-negative');
        marginRateSpan.classList.remove('profit-positive');
        marginRateSpan.classList.add('profit-negative');
    }

    // -----------------------------------------------------------------
    // 计算9：备货相关统计
    // -----------------------------------------------------------------

    // 备货总货值 = 产品单价 × 备货量
    const totalStockValueRMB = productUnitPrice * stockQty;
    totalStockValueSpan.innerText = '¥ ' + totalStockValueRMB.toFixed(2);

    // 总箱数 = 备货量 / 装箱数（向上取整）
    const totalBoxes = stockQty / packQty;
    totalBoxesSpan.innerText = Math.ceil(totalBoxes) + ' 箱';

    // 总体积(CBM) = 单件体积 × 备货量
    const totalVolumeCBM = singleVolumeM3 * stockQty;
    totalCBMSpan.innerText = totalVolumeCBM.toFixed(3) + ' m³';
}

// -------------------------------------------------------------------------
// 第六部分：重置功能
// -------------------------------------------------------------------------

/**
 * 重置为默认产品（太阳能路灯）的参数值
 * 点击"重置为默认产品"按钮时调用
 */
function resetToDefault() {
    // 产品尺寸 (cm)
    document.getElementById('length').value = '52.5';
    document.getElementById('width').value = '39.5';
    document.getElementById('height').value = '44.5';

    // 装箱信息
    document.getElementById('packQty').value = '10';      // 10个/箱
    document.getElementById('boxWeight').value = '17';    // 箱重17kg

    // 价格信息
    document.getElementById('productCost').value = '67';  // 产品单价67元
    document.getElementById('sellPrice').value = '249';  // 售价249 BRL

    // 头程方式：灰清（体积重系数6100）
    shippingTypeSelect.value = '灰清';

    // 费率（不重置汇率，保留实时获取的值）
    document.getElementById('commissionRate').value = '16.5';  // 佣金16.5%
    document.getElementById('adRate').value = '3';             // 广告3%
    document.getElementById('taxRate').value = '5';            // 税点5%
    // 注意：不再重置汇率，保留当前值（可能是API获取的或用户修改的）

    // 末端费用（默认0，用户需根据实际情况填写）
    document.getElementById('operationFee').value = '0';
    document.getElementById('lastMileFee').value = '0';
    document.getElementById('otherFee').value = '0';

    // 备货量
    document.getElementById('stockQty').value = '500';

    // 重新计算
    computeAll();
}

// -------------------------------------------------------------------------
// 第七部分：事件绑定
// -------------------------------------------------------------------------

// 需要监听输入事件的元素ID列表
const inputs = [
    'length', 'width', 'height', 'packQty', 'boxWeight', 
    'productCost', 'sellPrice',           // 基础信息
    'commissionRate', 'adRate', 'taxRate', 'exchangeRate',  // 费率
    'operationFee', 'lastMileFee', 'otherFee',  // 末端费用
    'stockQty'                             // 备货量
];

// 为所有输入框绑定'input'事件（用户输入时实时计算）
inputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('input', computeAll);
    }
});

// 为头程方式下拉框绑定'change'事件（切换选项时重新计算）
shippingTypeSelect.addEventListener('change', computeAll);

// 为重置按钮绑定点击事件
const resetBtn = document.getElementById('resetBtn');
if (resetBtn) resetBtn.addEventListener('click', resetToDefault);

// -------------------------------------------------------------------------
// 第八部分：实时汇率获取
// -------------------------------------------------------------------------

/**
 * 默认汇率（当API获取失败时使用）
 * 注意：这是硬编码的备用汇率，建议及时更新
 */
const DEFAULT_EXCHANGE_RATE = 1.30;  // 1 BRL = 1.30 CNY（近似值）

/**
 * 从API获取巴西雷亚尔(BRL)兑人民币(CNY)的实时汇率
 * 使用 frankfurter.app 免费API（无需注册）
 * @returns {Promise<number>} 汇率值
 */
async function fetchExchangeRate() {
    try {
        // frankfurter.app 提供免费的汇率数据
        // 从 BRL(巴西雷亚尔) 转换到 CNY(人民币)
        const response = await fetch('https://api.frankfurter.app/latest?from=BRL&to=CNY');

        if (!response.ok) {
            throw new Error(`API响应错误: ${response.status}`);
        }

        const data = await response.json();

        if (data && data.rates && data.rates.CNY) {
            const rate = data.rates.CNY;
            console.log(`实时汇率获取成功: 1 BRL = ${rate} CNY (数据来源: ${data.source || 'frankfurter.app'})`);
            return rate;
        } else {
            throw new Error('汇率数据格式错误');
        }
    } catch (error) {
        console.warn(`汇率获取失败，使用默认汇率 ${DEFAULT_EXCHANGE_RATE}:`, error.message);
        return DEFAULT_EXCHANGE_RATE;
    }
}

/**
 * 更新页面上的汇率显示信息
 * @param {number} rate - 汇率值
 * @param {string} source - 数据来源
 * @param {string} updateTime - 更新时间
 */
function updateExchangeRateDisplay(rate, source = '实时API', updateTime = new Date().toLocaleString('zh-CN')) {
    const exchangeRateInput = document.getElementById('exchangeRate');
    if (exchangeRateInput) {
        exchangeRateInput.value = rate.toFixed(4);  // 显示4位小数
    }

    // 更新汇率提示信息（如果存在该元素）
    const hintElement = exchangeRateInput?.nextElementSibling;
    if (hintElement && hintElement.classList.contains('unit-hint')) {
        hintElement.textContent = `${source} | 更新: ${updateTime}`;
    }

    // 存储最后更新时间到 localStorage
    localStorage.setItem('exchangeRate_lastUpdate', updateTime);
    localStorage.setItem('exchangeRate_value', rate.toString());
}

/**
 * 页面加载时初始化汇率
 * 优先从 localStorage 读取今日缓存，若无则从API获取
 */
async function initExchangeRate() {
    const today = new Date().toDateString();  // 如 "Mon May 25 2026"
    const cachedDate = localStorage.getItem('exchangeRate_date');
    const cachedRate = localStorage.getItem('exchangeRate_value');

    // 检查是否有今日的缓存汇率
    if (cachedDate === today && cachedRate) {
        console.log(`使用缓存汇率: 1 BRL = ${cachedRate} CNY (缓存日期: ${today})`);
        updateExchangeRateDisplay(parseFloat(cachedRate), '今日缓存', localStorage.getItem('exchangeRate_lastUpdate') || today);
        computeAll();  // 使用缓存汇率计算
        return;
    }

    // 无缓存或日期不同，从API获取新汇率
    console.log('正在获取实时汇率...');
    const rate = await fetchExchangeRate();

    // 更新缓存
    localStorage.setItem('exchangeRate_date', today);
    localStorage.setItem('exchangeRate_value', rate.toString());

    updateExchangeRateDisplay(rate, '实时API', new Date().toLocaleString('zh-CN'));

    // 执行计算
    computeAll();
}

// -------------------------------------------------------------------------
// 第九部分：初始化
// -------------------------------------------------------------------------

/**
 * 页面加载时执行一次计算
 * 确保用户打开页面时就能看到计算结果，而非空白
 */
// 初始化汇率（异步获取实时汇率）
initExchangeRate();