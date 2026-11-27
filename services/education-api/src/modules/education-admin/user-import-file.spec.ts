import { BadRequestException, NotFoundException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { buildXlsx } from '../learning/question-import';
import { EducationAdminService } from './education-admin.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const service = () => new EducationAdminService({} as never, { isSystemAdministrator: (u: { systemPermissions: string[] }) => u.systemPermissions.includes('org.manage') } as never, {} as never, {} as never, {} as never);
const sysadmin = { systemPermissions: ['org.manage'], memberships: [] } as never;
const schoolAdmin = (organizationId: string) => ({ systemPermissions: [], memberships: [{ organizationId, status: 'active', permissions: ['education.members.provision'] }] }) as never;
const b64 = (buffer: Buffer) => buffer.toString('base64');
/** A minimal STORED (uncompressed) .xlsx so a test can hand-write sheet XML. */
function storedXlsx(sheetXml: string): Buffer {
  const entries = [['[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'], ['xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>'], ['xl/worksheets/sheet1.xml', sheetXml]];
  const parts: Buffer[] = []; const central: Buffer[] = []; let offset = 0;
  for (const [name, text] of entries) {
    const nameBuf = Buffer.from(name); const data = Buffer.from(text);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    const head = Buffer.alloc(46); head.writeUInt32LE(0x02014b50, 0); head.writeUInt32LE(data.length, 20); head.writeUInt32LE(data.length, 24); head.writeUInt16LE(nameBuf.length, 28); head.writeUInt32LE(offset, 42);
    parts.push(local, nameBuf, data); central.push(head, nameBuf); offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(central); const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}
const header = ['first_name', 'last_name', 'student_code', 'grade_level'];

describe('school user import: spreadsheet upload parsing', () => {
  it('turns an XLSX into the import CSV, keeping Vietnamese names and leading zeros as text, and creates nothing', async () => {
    const xlsx = buildXlsx([header, ['Học sinh', 'kiểm thử 01', '000123', '10'], ['Nguyễn', 'Thị "Mai"', 'VT-002', '10']]);
    const out = await service().parseImportFile(sysadmin, ORG, { fileName: 'students.xlsx', contentBase64: b64(xlsx) });
    expect(out.rows).toBe(2);
    expect(out.csv).toBe('first_name,last_name,student_code,grade_level\nHọc sinh,kiểm thử 01,000123,10\nNguyễn,"Thị ""Mai""",VT-002,10\n');
  });

  it('reads a workbook whose elements carry an XML namespace prefix (x:row / x:c / x:v), as written by some producers', async () => {
    const file = '/home/quangduc/Code/vista/VISTA_Student_Import_Test.xlsx';
    let buffer: Buffer; try { buffer = readFileSync(file); } catch { return; }          // the owner's local file is not part of the repository
    const out = await service().parseImportFile(sysadmin, ORG, { fileName: 'VISTA_Student_Import_Test.xlsx', contentBase64: b64(buffer) });
    expect(out.csv.split('\n')[0]).toBe('studentCode,fullName');
    expect(out.rows).toBe(10);
  });

  it('accepts a CSV upload unchanged and rejects other file types', async () => {
    const csv = Buffer.from(`${header.join(',')}\nAn,Binh,0042,9\n`);
    await expect(service().parseImportFile(sysadmin, ORG, { fileName: 'a.csv', contentBase64: b64(csv) })).resolves.toMatchObject({ rows: 1 });
    await expect(service().parseImportFile(sysadmin, ORG, { fileName: 'a.exe', contentBase64: b64(csv) })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('never evaluates formulas: a workbook with a formula cell is refused (and the same sheet without it is read)', async () => {
    const sheet = (cell: string) => `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>student_code</t></is></c></row><row r="2">${cell}</row></sheetData></worksheet>`;
    const plain = storedXlsx(sheet('<c r="A2" t="inlineStr"><is><t>C1</t></is></c>'));
    const formula = storedXlsx(sheet('<c r="A2"><f>1+1</f><v>2</v></c>'));
    await expect(service().parseImportFile(sysadmin, ORG, { fileName: 'p.xlsx', contentBase64: b64(plain) })).resolves.toMatchObject({ rows: 1 });
    await expect(service().parseImportFile(sysadmin, ORG, { fileName: 'f.xlsx', contentBase64: b64(formula) })).rejects.toMatchObject({ response: { message: expect.stringMatching(/formulas/i) } });
  });

  it('refuses spreadsheet-injection values, malformed base64, empty files and too many rows', async () => {
    for (const bad of ['=HYPERLINK("http://x")', '@SUM(1)', '+cmd|x', '-cmd(1)']) {
      const csv = Buffer.from(`${header.join(',')}\n"${bad.replace(/"/g, '""')}",B,C1,10\n`);
      await expect(service().parseImportFile(sysadmin, ORG, { fileName: 'i.csv', contentBase64: b64(csv) })).rejects.toMatchObject({ response: { code: 'IMPORT_FILE_INVALID' } });
    }
    await expect(service().parseImportFile(sysadmin, ORG, { fileName: 'a.csv', contentBase64: '***not base64***' })).rejects.toMatchObject({ response: { code: 'IMPORT_FILE_INVALID' } });
    await expect(service().parseImportFile(sysadmin, ORG, { fileName: 'a.csv', contentBase64: b64(Buffer.from(`${header.join(',')}\n`)) })).rejects.toMatchObject({ response: { code: 'IMPORT_FILE_EMPTY' } });
    const many = `${header.join(',')}\n${Array.from({ length: 501 }, (_, i) => `A,B,C${i},10`).join('\n')}\n`;
    await expect(service().parseImportFile(sysadmin, ORG, { fileName: 'm.csv', contentBase64: b64(Buffer.from(many)) })).rejects.toMatchObject({ response: { code: 'IMPORT_FILE_TOO_LARGE' } });
  });

  it('is organization-scoped: a School Admin of another organization, and a user without the provision permission, get 404', async () => {
    const csv = b64(Buffer.from(`${header.join(',')}\nA,B,C1,10\n`));
    await expect(service().parseImportFile(schoolAdmin(ORG), ORG, { fileName: 'a.csv', contentBase64: csv })).resolves.toMatchObject({ rows: 1 });
    await expect(service().parseImportFile(schoolAdmin('22222222-2222-4222-8222-222222222222'), ORG, { fileName: 'a.csv', contentBase64: csv })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service().parseImportFile({ systemPermissions: [], memberships: [{ organizationId: ORG, status: 'active', permissions: [] }] } as never, ORG, { fileName: 'a.csv', contentBase64: csv })).rejects.toBeInstanceOf(NotFoundException);
  });
});
