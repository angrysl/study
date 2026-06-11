import pandas as pd

file_path = r'd:\File\project\mercadolibre-calculator\【TikTok Shop东南亚跨境】成本计算表（请复制出去使用,不要申请编辑权限,仅供参考).xlsx'

try:
    xls = pd.ExcelFile(file_path)
    
    with open('excel_report.txt', 'w', encoding='utf-8') as f:
        f.write('=== Excel文件分析报告 ===\n')
        f.write(f'工作表数量: {len(xls.sheet_names)}\n')
        f.write(f'工作表名称: {xls.sheet_names}\n')
        f.write('\n')
        
        for sheet_name in xls.sheet_names:
            df = pd.read_excel(xls, sheet_name=sheet_name)
            f.write(f'--- 工作表: {sheet_name} ---\n')
            f.write(f'行数: {df.shape[0]}, 列数: {df.shape[1]}\n')
            f.write(f'列名: {df.columns.tolist()}\n')
            f.write('\n')
            f.write('数据预览:\n')
            f.write(df.to_string())
            f.write('\n\n')
    
    print('报告已生成: excel_report.txt')
        
except Exception as e:
    print(f'错误: {e}')
    with open('excel_report.txt', 'w', encoding='utf-8') as f:
        f.write(f'错误: {e}\n')
