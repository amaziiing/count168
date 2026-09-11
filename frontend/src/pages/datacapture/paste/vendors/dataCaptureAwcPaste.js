/** AWC parsers + HTML fill. */
import { formatNumberToTwoDecimals } from "../core/dataCapturePasteMoneyUtils.js";



import { applyParsedMatrixToGrid } from "../core/dataCapturePasteApply.js";
import { notifyPasteUser, recomputeSubmitStateAfterPaste } from "../../lib/dataCaptureBridge.js";

/**
 * AWC WinLoss Summary report (gciag.usplaynet.com and sibling AWC agent
 * portals) — single tool shared by 1.TEXT / 2.FORMAT / 3.CITIBET so a paste
 * of this specific report behaves the same regardless of which capture mode
 * is selected, without touching those modes' generic parsing for every other
 * report source.
 *
 * Two bugs this closes, both rooted in the SAME cause — the source page's
 * el-table renders a hidden row-selection checkbox <td> before every real
 * data row (but not before Sub Total rows, and not inside whatever row the
 * user's drag-select started on):
 *
 * 1. Truncation: a single/short selection's text/plain lands as one value per
 *    line (no tabs). The shared vertical-dump reshaper (detectVerticalFieldDump)
 *    guesses a short fixed row width from a coincidental "label + N money
 *    tokens" run and silently drops whatever came before that guess.
 * 2. Column shift: a multi-row selection's HTML keeps that leading empty
 *    checkbox <td> on every FULLY-CONTAINED row except the first (the first
 *    row's selection anchor starts past it), shifting those rows one column
 *    right of their siblings.
 *
 * Fix: extract only NON-EMPTY cell text, from HTML when available (so the
 * true column count and every row survive) or from plain text otherwise, then
 * regroup by recognizing this report's own row-start markers (a lowercase
 * User ID, or a "Sub Total[ ... ]" label) via the existing
 * parseAWCPatternBasedData — this never invents a fixed width and empty
 * cells never became tokens in the first place, so neither the truncation
 * nor the column-shift artifact can occur.
 */

const AWC_WIN_LOSS_TYPE_TOKENS = new Set(["LIVE", "TABLE", "SLOT", "SPORTS"]);

function awcWinLossLooksLikeMoneyToken(token) {
    const raw = String(token ?? "").replace(/ /g, " ").trim();
    if (!raw) return false;
    const stripped = raw
        .replace(/[,$]/g, "")
        .replace(/^\((.*)\)$/, "-$1")
        .replace(/\s*%$/, "");
    return /^-?\d+(?:\.\d+)?$/.test(stripped);
}

function awcWinLossLooksLikeUserId(token) {
    const t = String(token ?? "").trim();
    return /^[a-z][a-z0-9]{2,14}$/i.test(t) && !/^\d+$/.test(t);
}

/**
 * Detection gate — only this report's shape may use this tool. Requires
 * either a "Sub Total[ ... ]" marker (this report's subtotal rows), or a
 * lowercase User ID immediately followed within a few tokens by a known
 * report Type ("LIVE"/"TABLE"/"SLOT"/"SPORTS"), plus enough money-shaped
 * tokens overall to rule out a coincidental match on an unrelated report.
 */
export function looksLikeAwcWinLossReportTokens(tokens) {
    if (!Array.isArray(tokens) || tokens.length < 6) return false;

    const hasSubTotalMarker = tokens.some((t) => /^SUB\s*TOTAL\s*\[/i.test(String(t ?? "").trim()));

    const hasUserIdThenType = tokens.some((token, index) => {
        if (!awcWinLossLooksLikeUserId(token)) return false;
        for (let j = index + 1; j < Math.min(index + 4, tokens.length); j += 1) {
            if (AWC_WIN_LOSS_TYPE_TOKENS.has(String(tokens[j] ?? "").trim().toUpperCase())) return true;
        }
        return false;
    });

    if (!hasSubTotalMarker && !hasUserIdThenType) return false;

    const moneyCount = tokens.filter(awcWinLossLooksLikeMoneyToken).length;
    return moneyCount >= 3;
}

/** Non-empty cell text only, in document order — structurally-empty <td>s (e.g. the source page's row-selection checkbox column) never become tokens, so the leading-column shift they cause elsewhere can't happen here. */
function extractNonEmptyHtmlCellTokens(table) {
    const tokens = [];
    table.querySelectorAll("tr").forEach((tr) => {
        tr.querySelectorAll("td, th").forEach((cell) => {
            const text = (cell.textContent || cell.innerText || "").replace(/\s+/g, " ").trim();
            if (text) tokens.push(text);
        });
    });
    return tokens;
}

/** Per-row {text, colspan} records for one <table>. Colspan is kept so a rectangular grid (an Excel copy) can be told apart from the portal's ragged el-table markup. Empty <tr>s are skipped, matching extractNonEmptyHtmlCellTokens. */
function extractTableCellRecords(table) {
    const rows = [];
    table.querySelectorAll("tr").forEach((tr) => {
        const cells = [];
        tr.querySelectorAll("td, th").forEach((cell) => {
            const colspan = Math.max(1, parseInt(cell.getAttribute("colspan") || "1", 10) || 1);
            const text = (cell.textContent || cell.innerText || "").replace(/\s+/g, " ").trim();
            cells.push({ text, colspan });
        });
        if (cells.length) rows.push(cells);
    });
    return rows;
}

/**
 * A clean rectangular grid — every row the same colspan-expanded width — is an
 * Excel/Sheets copy of this report, not the portal's el-table (whose
 * row-selection checkbox <td> is missing on the row the drag-select started on
 * and absent on Sub Total rows, so portal selections are never rectangular).
 * Build it row-by-row so every row and every real column survive verbatim.
 *
 * This must never go through parseAWCPatternBasedData: that re-groups a
 * flattened token stream by row-start markers designed for the portal's
 * vertical dump, and silently drops every row whose marker it cannot
 * recognize — user ids starting with a digit ("717a") or an uppercase letter
 * ("KZ999") get glued into the previous row's group and truncated away by the
 * most-common-column-count pass.
 *
 * @param cellRows {Array<Array<{text: string, colspan: number}>>}
 * @returns {string[][] | null} null when the markup is not one rectangular grid.
 */
export function buildAwcWinLossMatrixFromCellRows(cellRows) {
    if (!Array.isArray(cellRows) || cellRows.length < 2) return null;

    const expandedWidth = (cells) => cells.reduce((sum, cell) => sum + cell.colspan, 0);
    const width = expandedWidth(cellRows[0]);
    if (width < 3) return null;
    if (cellRows.some((cells) => expandedWidth(cells) !== width)) return null;

    const matrix = cellRows.map((cells) => {
        const row = [];
        cells.forEach((cell) => {
            row.push(cell.text);
            for (let i = 1; i < cell.colspan; i += 1) row.push("");
        });
        return row;
    });

    // A leading all-empty column is a structural selection/checkbox column,
    // not report data — the first data column is always Currency/ID text.
    if (matrix.every((row) => row[0] === "")) {
        matrix.forEach((row) => row.shift());
    }
    return matrix;
}

function buildAwcWinLossMatrixFromHtml(html) {
    if (!html || !/<table\b/i.test(html)) return null;
    try {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = html;
        // A drag-select can span sibling <table>s (e.g. the source page keeps
        // the "Total" footer as a separate <table> from the data rows) — walk
        // every top-level table in document order so none of the selection is
        // silently dropped.
        const tables = Array.from(tempDiv.querySelectorAll("table")).filter(
            (t) => !t.parentElement?.closest("table"),
        );
        if (!tables.length) return null;

        // Excel/Sheets copies of this report land as one rectangular table —
        // build it directly so every row and column survive. The gate runs on
        // the same tokens the flatten path would see, so what gets claimed is
        // unchanged; only the matrix build differs.
        if (tables.length === 1) {
            const rectangular = buildAwcWinLossMatrixFromCellRows(
                extractTableCellRecords(tables[0]),
            );
            if (rectangular) {
                const rectangularTokens = rectangular.flat().filter((token) => token !== "");
                if (!looksLikeAwcWinLossReportTokens(rectangularTokens)) return null;
                return rectangular;
            }
        }

        const tokens = tables.flatMap((table) => extractNonEmptyHtmlCellTokens(table));
        if (!looksLikeAwcWinLossReportTokens(tokens)) return null;
        return parseAWCPatternBasedData(tokens);
    } catch (err) {
        console.error("AWC WinLoss: error extracting HTML table tokens:", err);
        return null;
    }
}

function buildAwcWinLossMatrixFromPlainText(pastedData) {
    const normalized = String(pastedData ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = normalized
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "");
    if (!looksLikeAwcWinLossReportTokens(lines)) return null;
    return parseAWCPatternBasedData(lines);
}

/** @returns {string[][] | null} */
export function buildAwcWinLossReportMatrix(html, pastedData) {
    const fromHtml = buildAwcWinLossMatrixFromHtml(html);
    if (fromHtml?.length) return fromHtml;
    return buildAwcWinLossMatrixFromPlainText(pastedData);
}

/**
 * Shared entry point for 1.TEXT / 2.FORMAT / 3.CITIBET. Pass either
 * `anchorCell`, or `startRowOverride`/`startColOverride` (2.FORMAT's
 * convention) via `applyOptions`.
 * @returns {boolean}
 */
export function tryHandleAwcWinLossReportPaste(html, pastedData, applyOptions = {}) {
    const dataMatrix = buildAwcWinLossReportMatrix(html, pastedData);
    if (!dataMatrix?.length) return false;

    const { anchorCell = null, ...gridOptions } = applyOptions;
    const { successCount, maxRows, maxCols } = applyParsedMatrixToGrid(dataMatrix, anchorCell, {
        ...gridOptions,
        trimValues: false,
        alignTotalRows: false,
        successMessage: null,
    });

    if (successCount > 0) {
        notifyPasteUser(
            `AWC WinLoss Summary: 成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${maxCols} 列)!`,
            "success",
        );
        recomputeSubmitStateAfterPaste();
        return true;
    }
    return false;
}

export function parseAWCPatternBasedData(lines) {
    try {
        console.log('AWC (2.7): Parsing pattern-based data, total lines:', lines.length);

        // Sub Total[ xxx ] rows AND the report-level Total / Grand Total rows
        // share the same 3-col-label layout (User ID + Platform + Type merged
        // into one label cell) — treat them the same for row-start detection
        // and column padding below.
        const isAggregateLabel = (text) => {
            const trimmed = String(text ?? '').trim().toUpperCase();
            if (trimmed.startsWith('SUB TOTAL[') || trimmed.startsWith('SUBTOTAL[')) return true;
            return trimmed === 'TOTAL' || trimmed === 'GRAND TOTAL';
        };

        // 识别行起始标识符：用户ID、Sub Total、Total 等
        const isRowStart = (text, index, allLines) => {
            if (!text || text.trim() === '') return false;
            const originalText = text.trim();
            const trimmed = originalText.toUpperCase();

            // 1. 匹配 Sub Total[ xxx ] / Total / Grand Total 格式 - 优先检查
            if (isAggregateLabel(trimmed)) {
                return true;
            }

            // 2. 明确排除类型标识（必须放在前面）
            const isTypeIdentifier = ['LIVE', 'TABLE', 'SLOT', 'SPORTS'].includes(trimmed);
            if (isTypeIdentifier) {
                return false;
            }

            // 3. 明确排除平台名（全大写，长度>=4）
            const isAllUppercase = /^[A-Z]+$/.test(originalText);
            const isPlatformName = isAllUppercase && originalText.length >= 4;

            // 常见的平台名列表（全大写）
            const knownPlatforms = ['SEXYBCRT', 'KINGMIDAS', 'SV388', 'KINGMASTER', 'KINGGAME', 'ALLBET', 'PP88'];
            if (isPlatformName || knownPlatforms.includes(trimmed)) {
                return false;
            }

            // 4. 只匹配以小写字母开头的用户ID（如op7a, tr8, victorbetvtb）
            // 用户ID特征：
            // - 以小写字母开头
            // - 包含字母和/或数字
            // - 长度3-15个字符
            const startsWithLowercase = /^[a-z]/.test(originalText);
            const isValidLength = originalText.length >= 3 && originalText.length <= 15;
            const isValidFormat = /^[a-z0-9]+$/i.test(originalText);
            const isNotNumeric = !/^\d+$/.test(originalText); // 排除纯数字

            if (startsWithLowercase && isValidLength && isValidFormat && isNotNumeric) {
                // 进一步验证：检查下一行是否是平台名或类型
                if (index + 1 < allLines.length) {
                    const nextLine = (allLines[index + 1] || '').trim();
                    const nextUpper = nextLine.toUpperCase();
                    const isNextPlatform = /^[A-Z]{4,20}$/.test(nextLine);
                    const isNextType = ['LIVE', 'TABLE', 'SLOT', 'SPORTS'].includes(nextUpper);

                    // 如果下一行是平台名或类型，当前行确实是用户ID
                    if (isNextPlatform || isNextType) {
                        return true;
                    }
                }

                // 检查上一行是否是Sub Total，如果是，当前行很可能是新的用户ID
                if (index > 0) {
                    const prevLine = (allLines[index - 1] || '').trim().toUpperCase();
                    if (prevLine.startsWith('SUB TOTAL[') || prevLine.startsWith('SUBTOTAL[')) {
                        return true;
                    }
                }

                // 如果是以小写开头且长度合理，也可能是用户ID（但优先级较低）
                return true;
            }

            return false;
        };

        // 检测平台名称（如SEXYBCRT, KINGMIDAS, SV388）和类型（如LIVE, TABLE）
        const isPlatformOrType = (text) => {
            if (!text || text.trim() === '') return false;
            const trimmed = text.trim().toUpperCase();
            // 全大写字母，长度4-20
            return /^[A-Z]{4,20}$/.test(trimmed);
        };

        // 识别每行的起始位置（只识别真正的行起始：用户ID和Sub Total）
        const rowStartIndices = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (isRowStart(line, i, lines)) {
                rowStartIndices.push(i);
                console.log(`AWC (2.7): Found row start at line ${i}: "${line}"`);
            }
        }

        // 如果没有找到行标识符，尝试通过固定列数分组（AWC格式通常是17-18列）
        if (rowStartIndices.length === 0) {
            console.log('AWC (2.7): No row identifiers found, trying fixed-column grouping...');
            // 尝试不同的列数（15-20列），找到最合理的分组
            let bestMatch = null;
            let bestScore = 0;

            for (let cols = 15; cols <= 20; cols++) {
                const rows = Math.ceil(lines.length / cols);
                const remainder = lines.length % cols;

                // 如果能整除或剩余很少，认为这个列数合理
                if (remainder === 0 || remainder / cols < 0.1) {
                    const score = remainder === 0 ? 1000 : (1 - remainder / cols) * 100;
                    if (score > bestScore) {
                        bestScore = score;
                        bestMatch = { cols: cols, rows: rows };
                    }
                }
            }

            if (bestMatch) {
                console.log(`AWC (2.7): Using fixed-column grouping: ${bestMatch.cols} columns`);
                const dataMatrix = [];

                for (let i = 0; i < lines.length; i += bestMatch.cols) {
                    const row = lines.slice(i, i + bestMatch.cols).map(line => line.trim());
                    if (row.length > 0) {
                        dataMatrix.push(row);
                    }
                }

                console.log(`AWC (2.7): Grouped ${lines.length} lines into ${dataMatrix.length} rows`);
                return dataMatrix;
            }
        }

        // 根据行标识符分组成行
        const dataMatrix = [];
        for (let i = 0; i < rowStartIndices.length; i++) {
            const startIndex = rowStartIndices[i];
            const endIndex = (i + 1 < rowStartIndices.length) ? rowStartIndices[i + 1] : lines.length;

            // 提取这一行的所有值（直到下一个行标识符或Sub Total）
            const row = [];
            for (let j = startIndex; j < endIndex; j++) {
                const value = lines[j].trim();
                // 跳过空行
                if (value !== '') {
                    row.push(value);
                }
            }

            if (row.length > 0) {
                dataMatrix.push(row);
                console.log(`AWC (2.7): Row ${dataMatrix.length - 1}: ${row.length} columns, starts with: "${row[0]}"`);
            }
        }

        // 验证并统一列数：找出最常见的列数（排除Sub Total行）
        if (dataMatrix.length > 0) {
            const dataRowLengths = dataMatrix
                .filter(row => !isAggregateLabel(row[0]))
                .map(row => row.length);

            if (dataRowLengths.length > 0) {
                // 找出最常见的列数
                const lengthCounts = {};
                dataRowLengths.forEach(len => {
                    lengthCounts[len] = (lengthCounts[len] || 0) + 1;
                });

                let mostCommonLength = dataRowLengths[0];
                let maxCount = 0;
                for (const [len, count] of Object.entries(lengthCounts)) {
                    if (count > maxCount) {
                        maxCount = count;
                        mostCommonLength = parseInt(len);
                    }
                }

                console.log(`AWC (2.7): Most common row length: ${mostCommonLength} columns`);

                // 确保所有行都有相同的列数（填充或截断）
                // 特殊处理：Sub Total 行需要在前面插入空白单元格以保持列对齐
                dataMatrix.forEach((row, index) => {
                    const isSubTotalRow = isAggregateLabel(row[0]);

                    if (isSubTotalRow) {
                        // Sub Total[ xxx ] / Total / Grand Total 行的格式：第一列是标签，后面跟着数值
                        // 但数值应该从第4列开始（跳过 User ID、Platform、Type 三列）
                        // 所以需要在标签后面插入2个空白单元格

                        // 检查当前行的结构
                        if (row.length > 0 && row.length < mostCommonLength) {
                            // Sub Total 行：第一列是标签，后面是数值
                            // 需要在第一列后插入空白单元格，使数值从第4列开始
                            const subTotalLabel = row[0];
                            const subTotalValues = row.slice(1); // 从第二列开始的所有值

                            // 重新构建行：标签 + 2个空白单元格 + 数值
                            const newRow = [subTotalLabel, '', '', ...subTotalValues];

                            // 确保行长度正确
                            while (newRow.length < mostCommonLength) {
                                newRow.push('');
                            }
                            if (newRow.length > mostCommonLength) {
                                newRow.splice(mostCommonLength);
                            }

                            // 替换原行
                            dataMatrix[index] = newRow;
                            console.log(`AWC (2.7): Sub Total row ${index} adjusted: ${newRow.length} columns (inserted 2 blank cells after label)`);
                        } else {
                            // 如果列数已经足够，只需要确保长度正确
                            while (row.length < mostCommonLength) {
                                row.push('');
                            }
                            if (row.length > mostCommonLength) {
                                row.splice(mostCommonLength);
                            }
                        }
                    } else {
                        // 普通数据行：直接填充或截断
                        while (row.length < mostCommonLength) {
                            row.push('');
                        }
                        if (row.length > mostCommonLength) {
                            // 如果超过，可能需要截断（但通常不应该发生）
                            console.warn(`AWC (2.7): Row ${index} has ${row.length} columns, expected ${mostCommonLength}`);
                            row.splice(mostCommonLength);
                        }
                    }
                });
            }
        }

        console.log(`AWC (2.7): Successfully grouped into ${dataMatrix.length} rows`);
        if (dataMatrix.length > 0) {
            console.log(`AWC (2.7): First row: ${dataMatrix[0].length} columns, starts with: "${dataMatrix[0][0]}"`);
        }
        return dataMatrix;

    } catch (error) {
        console.error('AWC (2.7): Error parsing pattern-based data:', error);
        return null;
    }
}

export function parseAndFillHtmlTableForAwc(htmlString, startCell) {
    try {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlString;

        const table = tempDiv.querySelector('table');
        if (!table) {
            return false;
        }

        console.log('AWC (2.7): Parsing HTML table and preserving row format...');

        // 获取所有行（包括表头）
        const allRows = table.querySelectorAll('tr');
        if (allRows.length === 0) {
            return false;
        }

        // 计算最大列数
        let maxCols = 0;
        allRows.forEach(tr => {
            const cells = tr.querySelectorAll('td, th');
            let colCount = 0;
            cells.forEach(cell => {
                const colspan = parseInt(cell.getAttribute('colspan') || '1', 10);
                colCount += colspan;
            });
            maxCols = Math.max(maxCols, colCount);
        });

        if (maxCols === 0) {
            return false;
        }

        // 获取起始位置并填充
        const dataMatrix = [];

        allRows.forEach((sourceRow) => {
            const sourceCells = sourceRow.querySelectorAll('td, th');
            const rowData = new Array(maxCols).fill('');
            let colIndex = 0;

            sourceCells.forEach(sourceCell => {
                const colspan = parseInt(sourceCell.getAttribute('colspan') || '1', 10);
                let cellContent = sourceCell.textContent || '';
                const trimmedContent = cellContent.trim();

                if (colIndex < maxCols) {
                    rowData[colIndex] = trimmedContent;
                    colIndex++;
                }

                for (let i = 1; i < colspan; i++) {
                    if (colIndex < maxCols) {
                        rowData[colIndex] = '';
                        colIndex++;
                    }
                }
            });

            dataMatrix.push(rowData);
        });

        const { successCount, maxRows, maxCols: cols } = applyParsedMatrixToGrid(dataMatrix, startCell);

        if (successCount > 0) {
            notifyPasteUser(`AWC (2.7): 成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)，已保持表格行格式!`, 'success');
            recomputeSubmitStateAfterPaste();
            return true;
        } else {
            console.log('AWC (2.7): No cells were pasted');
            return false;
        }
    } catch (error) {
        console.error('AWC (2.7): Error parsing HTML table:', error);
        return false;
    }
}
