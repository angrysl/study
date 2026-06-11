// TikTok Shop 东南亚跨境成本计算器脚本

// 站点配置数据（包含默认汇率）
const siteData = {
    vietnam: {
        name: '越南',
        currency: 'VND',
        exchangeRate: 3802,  // 1人民币 = 3802越南盾（默认值）
        code: 'VND',
        rates: {
            commission: 0.13,      // 平台佣金 13%
            transaction: 0.05,     // 交易手续费 5%
            vat: 0.10,             // 增值税 10%
            other: 0.01            // 提现手续费 1%
        },
        shipping: {
            baseWeight: 10,        // 起重量 10g
            baseCost: 10900,       // 首重 10900 VND
            additionalCost: 900    // 续重 900 VND/g
        }
    },
    thailand: {
        name: '泰国',
        currency: 'THB',
        exchangeRate: 4.7,  // 1人民币 = 4.7泰铢（默认值）
        code: 'THB',
        rates: {
            commission: 0.0856,    // 平台佣金 8.56%
            transaction: 0.0321,   // 交易手续费 3.21%
            vat: 0.07,             // 增值税 7%
            infrastructure: 0.0023, // 平台基础设施费 0.23%
            growth: 0.0642,        // 电商增长服务费 6.42%
            duty: 0.30             // 关税 30%
        },
        shipping: {
            baseWeight: 10,        // 起重量 10g
            baseCost: 1,           // 首重 1 THB
            additionalCost: 1      // 续重 1 THB/g
        }
    },
    malaysia: {
        name: '马来西亚',
        currency: 'MYR',
        exchangeRate: 0.591716,  // 1人民币 = 0.591716马来币（默认值）
        code: 'MYR',
        rates: {
            commission: 0.1458,    // 平台佣金 14.58%
            transaction: 0.0378,   // 交易手续费 3.78%
            vat: 0.10,             // 增值税 10%
            other: 0.01            // 提现手续费 1%
        },
        shipping: {
            baseWeight: 10,        // 起重量 10g
            baseCost: 0.15,        // 首重 0.15 MYR
            additionalCost: 0.15   // 续重 0.15 MYR/g
        }
    },
    philippines: {
        name: '菲律宾',
        currency: 'PHP',
        exchangeRate: 8.65,  // 1人民币 = 8.65菲律宾比索（默认值）
        code: 'PHP',
        rates: {
            commission: 0.068,     // 平台佣金 6.8%
            transaction: 0.0224,   // 交易手续费 2.24%
            other: 0.01,           // 提现手续费 1%
            freeShipping: 0.055    // 包邮服务费 5.5%
        },
        shipping: {
            baseWeight: 10,        // 起重量 10g
            baseCost: 4.5,         // 首重 4.5 PHP
            additionalCost: 4.5    // 续重 4.5 PHP/g
        }
    },
    singapore: {
        name: '新加坡',
        currency: 'SGD',
        exchangeRate: 0.183486,  // 1人民币 = 0.183486新加坡元（默认值）
        code: 'SGD',
        rates: {
            commission: 0.0327,    // 平台佣金 3.27%
            transaction: 0.0218,   // 交易手续费 2.18%
            other: 0.01,           // 提现手续费 1%
            consumption: 0.09      // 消费税 9%
        },
        shipping: {
            baseWeight: 40,        // 起重量 40g
            baseCost: 0.98,        // 首重 0.98 SGD
            additionalCost: 0.15   // 续重 0.15 SGD/g
        }
    }
};

// 汇率API配置
const EXCHANGE_API_URL = 'https://api.frankfurter.app/latest';
const BASE_CURRENCY = 'CNY';  // 基准货币：人民币

// 从API获取实时汇率
async function fetchExchangeRates() {
    const currencies = Object.values(siteData).map(site => site.code).join(',');
    
    try {
        const response = await fetch(`${EXCHANGE_API_URL}?from=${BASE_CURRENCY}&to=${currencies}`);
        
        if (!response.ok) {
            throw new Error(`API请求失败: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data && data.rates) {
            console.log('实时汇率获取成功:', data.rates);
            return data.rates;
        } else {
            throw new Error('汇率数据格式错误');
        }
    } catch (error) {
        console.warn('汇率获取失败，使用默认汇率:', error.message);
        return null;
    }
}

// 更新汇率数据
function updateExchangeRates(rates) {
    if (!rates) return;
    
    Object.keys(siteData).forEach(key => {
        const code = siteData[key].code;
        if (rates[code]) {
            siteData[key].exchangeRate = rates[code];
        }
    });
}

// 检查是否需要更新汇率（每天更新一次）
function shouldUpdateRates() {
    const lastUpdate = localStorage.getItem('exchangeRatesLastUpdate');
    const today = new Date().toDateString();
    
    if (!lastUpdate || lastUpdate !== today) {
        return true;
    }
    return false;
}

// 保存汇率更新日期
function saveUpdateDate() {
    localStorage.setItem('exchangeRatesLastUpdate', new Date().toDateString());
}

// 获取缓存的汇率
function getCachedRates() {
    try {
        const cached = localStorage.getItem('exchangeRates');
        if (cached) {
            return JSON.parse(cached);
        }
    } catch (e) {
        console.warn('读取缓存汇率失败:', e);
    }
    return null;
}

// 保存汇率到缓存
function saveRatesToCache(rates) {
    try {
        localStorage.setItem('exchangeRates', JSON.stringify(rates));
    } catch (e) {
        console.warn('保存汇率缓存失败:', e);
    }
}

// 获取汇率更新时间显示
function getExchangeRateInfo() {
    const lastUpdate = localStorage.getItem('exchangeRatesLastUpdate');
    if (lastUpdate) {
        return `汇率更新时间: ${lastUpdate}`;
    }
    return '汇率: 默认值';
}

// 计算总费率
function getTotalRate(site) {
    const rates = siteData[site].rates;
    return Object.values(rates).reduce((sum, rate) => sum + rate, 0);
}

// 计算物流成本
function calculateShippingCost(site, weight) {
    const shipping = siteData[site].shipping;
    if (weight <= shipping.baseWeight) {
        return shipping.baseCost;
    } else {
        return shipping.baseCost + (weight - shipping.baseWeight) * shipping.additionalCost;
    }
}

// 当地货币转人民币
function localToCNY(localAmount, site) {
    return localAmount / siteData[site].exchangeRate;
}

// 人民币转当地货币
function cnyToLocal(cnyAmount, site) {
    return cnyAmount * siteData[site].exchangeRate;
}

// 主计算函数
function calculate() {
    const site = document.getElementById('site').value;
    const originalPrice = parseFloat(document.getElementById('originalPrice').value) || 0;
    const discount = parseFloat(document.getElementById('discount').value) || 10;
    const weight = parseFloat(document.getElementById('weight').value) || 0;
    const productCost = parseFloat(document.getElementById('productCost').value) || 0;
    const otherCost = parseFloat(document.getElementById('otherCost').value) || 0;
    const coupon = parseFloat(document.getElementById('coupon').value) || 0;

    // 计算折后价
    const discountedPrice = originalPrice * (discount / 10);
    const discountedPriceCNY = localToCNY(discountedPrice, site);

    // 计算平台费用
    const totalRate = getTotalRate(site);
    const platformFee = discountedPrice * totalRate;
    const platformFeeCNY = localToCNY(platformFee, site);

    // 计算物流成本
    const shippingCost = calculateShippingCost(site, weight);
    const shippingCostCNY = localToCNY(shippingCost, site);

    // 计算总成本（人民币）
    const totalCost = platformFeeCNY + shippingCostCNY + productCost + otherCost;

    // 计算利润（人民币）
    const profit = discountedPriceCNY - totalCost - localToCNY(coupon, site);

    // 计算毛利率
    const margin = discountedPriceCNY > 0 ? (profit / discountedPriceCNY * 100) : 0;

    // 更新显示
    document.getElementById('discountedPrice').textContent = 
        formatCurrency(discountedPrice, siteData[site].currency);
    document.getElementById('discountedPriceCNY').textContent = 
        `¥${discountedPriceCNY.toFixed(2)}`;
    
    document.getElementById('platformFee').textContent = 
        formatCurrency(platformFee, siteData[site].currency);
    document.getElementById('platformFeeCNY').textContent = 
        `¥${platformFeeCNY.toFixed(2)}`;
    
    document.getElementById('shippingCost').textContent = 
        formatCurrency(shippingCost, siteData[site].currency);
    document.getElementById('shippingCostCNY').textContent = 
        `¥${shippingCostCNY.toFixed(2)}`;
    
    document.getElementById('totalCost').textContent = 
        `¥${totalCost.toFixed(2)}`;
    
    const profitElement = document.getElementById('profit');
    profitElement.textContent = `¥${profit.toFixed(2)}`;
    profitElement.className = 'result-value highlight ' + (profit >= 0 ? 'profit' : 'loss');
    
    const marginElement = document.getElementById('margin');
    marginElement.textContent = `${margin.toFixed(2)}%`;
    marginElement.className = 'result-value ' + (margin >= 0 ? 'profit' : 'loss');

    // 更新物流成本对比
    document.getElementById('weightDisplay').textContent = weight;
    document.getElementById('shippingVN').textContent = 
        `¥${localToCNY(calculateShippingCost('vietnam', weight), 'vietnam').toFixed(2)}`;
    document.getElementById('shippingTH').textContent = 
        `¥${localToCNY(calculateShippingCost('thailand', weight), 'thailand').toFixed(2)}`;
    document.getElementById('shippingMY').textContent = 
        `¥${localToCNY(calculateShippingCost('malaysia', weight), 'malaysia').toFixed(2)}`;
    document.getElementById('shippingPH').textContent = 
        `¥${localToCNY(calculateShippingCost('philippines', weight), 'philippines').toFixed(2)}`;
    document.getElementById('shippingSG').textContent = 
        `¥${localToCNY(calculateShippingCost('singapore', weight), 'singapore').toFixed(2)}`;
}

// 格式化货币
function formatCurrency(amount, currency) {
    if (currency === 'VND') {
        return `${amount.toLocaleString('vi-VN')} VND`;
    } else if (currency === 'THB') {
        return `${amount.toLocaleString('th-TH')} THB`;
    } else if (currency === 'MYR') {
        return `RM${amount.toFixed(2)}`;
    } else if (currency === 'PHP') {
        return `₱${amount.toFixed(2)}`;
    } else if (currency === 'SGD') {
        return `S$${amount.toFixed(2)}`;
    }
    return amount.toFixed(2);
}

// 重置表单
function resetForm() {
    document.getElementById('originalPrice').value = 340000;
    document.getElementById('discount').value = 5;
    document.getElementById('weight').value = 400;
    document.getElementById('productCost').value = 2;
    document.getElementById('otherCost').value = 0;
    document.getElementById('coupon').value = 0;
    document.getElementById('site').value = 'vietnam';
    calculate();
}

// 生成费率表
function generateRatesTable() {
    const tbody = document.getElementById('ratesTable');
    tbody.innerHTML = '';

    const sites = ['vietnam', 'thailand', 'malaysia', 'philippines', 'singapore'];
    
    sites.forEach(site => {
        const data = siteData[site];
        const rates = data.rates;
        const totalRate = getTotalRate(site);
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${data.name}</td>
            <td>${(rates.commission * 100).toFixed(2)}%</td>
            <td>${(rates.transaction * 100).toFixed(2)}%</td>
            <td>${(rates.vat * 100).toFixed(2)}%</td>
            <td>${calculateOtherRates(rates)}</td>
            <td><strong>${(totalRate * 100).toFixed(2)}%</strong></td>
            <td>${data.exchangeRate.toFixed(4)}</td>
        `;
        tbody.appendChild(row);
    });
}

// 计算其他费用
function calculateOtherRates(rates) {
    let otherRates = [];
    if (rates.infrastructure) otherRates.push(`基础设施${(rates.infrastructure * 100).toFixed(2)}%`);
    if (rates.growth) otherRates.push(`增长服务${(rates.growth * 100).toFixed(2)}%`);
    if (rates.duty) otherRates.push(`关税${(rates.duty * 100).toFixed(2)}%`);
    if (rates.freeShipping) otherRates.push(`包邮服务${(rates.freeShipping * 100).toFixed(2)}%`);
    if (rates.consumption) otherRates.push(`消费税${(rates.consumption * 100).toFixed(2)}%`);
    if (rates.other) otherRates.push(`提现${(rates.other * 100).toFixed(2)}%`);
    return otherRates.join('<br>');
}

// 手动刷新汇率
async function refreshExchangeRates() {
    const rates = await fetchExchangeRates();
    if (rates) {
        updateExchangeRates(rates);
        saveRatesToCache(rates);
        saveUpdateDate();
        generateRatesTable();
        calculate();
        
        // 更新汇率信息显示
        const infoElement = document.getElementById('exchangeRateInfo');
        if (infoElement) {
            infoElement.textContent = getExchangeRateInfo();
        }
        
        alert('汇率已更新！');
    } else {
        alert('汇率更新失败，使用默认汇率');
    }
}

// 页面加载时初始化
async function init() {
    // 更新汇率信息显示
    const infoElement = document.getElementById('exchangeRateInfo');
    if (infoElement) {
        infoElement.textContent = getExchangeRateInfo();
    }
    
    // 检查是否需要更新汇率
    if (shouldUpdateRates()) {
        console.log('正在获取实时汇率...');
        const rates = await fetchExchangeRates();
        
        if (rates) {
            updateExchangeRates(rates);
            saveRatesToCache(rates);
            saveUpdateDate();
        } else {
            // 尝试使用缓存的汇率
            const cachedRates = getCachedRates();
            if (cachedRates) {
                updateExchangeRates(cachedRates);
            }
        }
    } else {
        // 使用缓存的汇率
        const cachedRates = getCachedRates();
        if (cachedRates) {
            updateExchangeRates(cachedRates);
        }
    }
    
    // 生成费率表和计算
    generateRatesTable();
    calculate();
}

// 页面加载完成后初始化
window.onload = init;