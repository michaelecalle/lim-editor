// Shim de types pour le bundle NAVIGATEUR d'exceljs : le point d'entrée Node
// (import "exceljs") pend dans le navigateur sous Vite (workbook.xlsx.load ne se
// résout jamais) — on importe donc explicitement le bundle UMD, avec les types du
// paquet principal.
declare module "exceljs/dist/exceljs.min.js" {
  import ExcelJS from "exceljs";
  export = ExcelJS;
}
