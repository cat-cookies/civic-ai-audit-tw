'use strict';

(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CivicXLSX = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const encoder = new TextEncoder();

  function xmlEscape(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function colName(index) {
    let n = index + 1;
    let out = '';
    while (n > 0) {
      const r = (n - 1) % 26;
      out = String.fromCharCode(65 + r) + out;
      n = Math.floor((n - 1) / 26);
    }
    return out;
  }

  function cellXml(value, row, col, style = 0) {
    const ref = `${colName(col)}${row + 1}`;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
    }
    return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
  }

  function sheetXml(rows, widths = []) {
    const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
    const cols = widths.length
      ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
      : '';
    const body = rows.map((row, r) => {
      const cells = row.map((value, c) => cellXml(value, r, c, r === 0 ? 1 : 2)).join('');
      return `<row r="${r + 1}"${r === 0 ? ' ht="25" customHeight="1"' : ''}>${cells}</row>`;
    }).join('');
    const ref = `A1:${colName(Math.max(0, maxCols - 1))}${Math.max(1, rows.length)}`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="${ref}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  ${cols}
  <sheetData>${body}</sheetData>
  <autoFilter ref="${ref}"/>
</worksheet>`;
  }

  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i += 1) {
      crc ^= bytes[i];
      for (let j = 0; j < 8; j += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function u16(value) {
    return new Uint8Array([value & 0xFF, (value >>> 8) & 0xFF]);
  }

  function u32(value) {
    return new Uint8Array([value & 0xFF, (value >>> 8) & 0xFF, (value >>> 16) & 0xFF, (value >>> 24) & 0xFF]);
  }

  function concat(parts) {
    const total = parts.reduce((sum, p) => sum + p.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }

  function dosDateTime(date = new Date()) {
    const year = Math.max(1980, date.getFullYear());
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const day = (year - 1980) << 9 | (date.getMonth() + 1) << 5 | date.getDate();
    return { time, day };
  }

  function zipStore(files) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    const stamp = dosDateTime();

    Object.entries(files).forEach(([name, content]) => {
      const nameBytes = encoder.encode(name);
      const data = typeof content === 'string' ? encoder.encode(content) : content;
      const crc = crc32(data);
      const local = concat([
        u32(0x04034B50), u16(20), u16(0x0800), u16(0), u16(stamp.time), u16(stamp.day),
        u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), nameBytes, data,
      ]);
      localParts.push(local);
      const central = concat([
        u32(0x02014B50), u16(20), u16(20), u16(0x0800), u16(0), u16(stamp.time), u16(stamp.day),
        u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0),
        u32(0), u32(offset), nameBytes,
      ]);
      centralParts.push(central);
      offset += local.length;
    });

    const central = concat(centralParts);
    const end = concat([
      u32(0x06054B50), u16(0), u16(0), u16(centralParts.length), u16(centralParts.length),
      u32(central.length), u32(offset), u16(0),
    ]);
    return concat([...localParts, central, end]);
  }

  function contentTypes(sheetCount) {
    const sheets = Array.from({ length: sheetCount }, (_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  ${sheets}
</Types>`;
  }

  function workbookXml(names) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView xWindow="0" yWindow="0" windowWidth="18000" windowHeight="10000"/></bookViews>
  <sheets>${names.map((name, i) => `<sheet name="${xmlEscape(name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>`;
  }

  function workbookRels(count) {
    const sheets = Array.from({ length: count }, (_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets}
  <Relationship Id="rId${count + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
  }

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font></fonts>
  <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F6B78"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD0D7DE"/></left><right style="thin"><color rgb="FFD0D7DE"/></right><top style="thin"><color rgb="FFD0D7DE"/></top><bottom style="thin"><color rgb="FFD0D7DE"/></bottom><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  function rowsFromDraft(draft) {
    const comparison = [['版本', '策略定位', '修正條文草稿', '修法理由', '優點', '風險', '執行需求', '財政影響']];
    const article = [['版本', '修正條文', '現行條文', '說明']];
    const reasons = [['版本', '序號', '修法理由／實質建議']];
    draft.versions.forEach(version => {
      comparison.push([
        version.name,
        version.strategy,
        version.amendedText,
        (version.reasons || []).join('\n'),
        (version.benefits || []).join('\n'),
        (version.risks || []).join('\n'),
        version.implementation || '',
        version.fiscalImpact || '',
      ]);
      article.push([
        version.name,
        version.amendedText,
        version.currentText || '',
        (version.reasons || []).join('\n'),
      ]);
      (version.reasons || []).forEach((reason, index) => reasons.push([version.name, index + 1, reason]));
    });
    const sources = [['項目', '內容']];
    sources.push(['草案名稱', draft.title || '']);
    sources.push(['制度問題', draft.issue || '']);
    sources.push(['政策目的', draft.goal || '']);
    sources.push(['擬修正方向', draft.proposedDirection || '']);
    (draft.sources || []).forEach((url, index) => sources.push([`官方來源 ${index + 1}`, url]));
    (draft.sharedChecks || []).forEach((item, index) => sources.push([`待人工查核 ${index + 1}`, item]));
    return [
      { name: '版本比較', rows: comparison, widths: [20, 28, 50, 48, 30, 30, 34, 26] },
      { name: '條文對照表', rows: article, widths: [20, 55, 55, 50] },
      { name: '修法理由', rows: reasons, widths: [20, 10, 90] },
      { name: '來源與待查核', rows: sources, widths: [24, 100] },
    ];
  }

  function buildWorkbookBytes(draft) {
    const sheets = rowsFromDraft(draft);
    const files = {
      '[Content_Types].xml': contentTypes(sheets.length),
      '_rels/.rels': rootRels,
      'xl/workbook.xml': workbookXml(sheets.map(s => s.name)),
      'xl/_rels/workbook.xml.rels': workbookRels(sheets.length),
      'xl/styles.xml': styles,
      'docProps/core.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(draft.title || '修法草案')}</dc:title><dc:creator>國家資料 AI 查證與改革觀測站</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`,
      'docProps/app.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Civic AI Audit</Application><Sheets>${sheets.length}</Sheets></Properties>`,
    };
    sheets.forEach((sheet, index) => { files[`xl/worksheets/sheet${index + 1}.xml`] = sheetXml(sheet.rows, sheet.widths); });
    return zipStore(files);
  }

  function downloadDraftXlsx(draft, filename = '修法草案比較.xlsx') {
    const bytes = buildWorkbookBytes(draft);
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  return { buildWorkbookBytes, downloadDraftXlsx, rowsFromDraft };
});
