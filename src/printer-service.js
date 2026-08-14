const KEY="bazaar_print_settings";
export const defaultPrinterSettings={paper:"80mm",connection:"browser",copies:1,autoPrint:false,printer:"",bluetoothName:""};
export function getPrinterSettings(){try{return {...defaultPrinterSettings,...JSON.parse(localStorage.getItem(KEY)||"{}")}}catch{return defaultPrinterSettings}}
export function savePrinterSettings(patch){const next={...getPrinterSettings(),...patch};localStorage.setItem(KEY,JSON.stringify(next));return next}
export async function selectBluetoothPrinter(){if(!navigator.bluetooth)throw new Error("المتصفح لا يدعم Web Bluetooth");const device=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:[]});const next=savePrinterSettings({connection:"bluetooth",bluetoothName:device.name||"Bluetooth Printer",printer:device.name||"Bluetooth Printer"});return {device,settings:next}}
export function bluetoothSupported(){return typeof navigator!=="undefined"&&!!navigator.bluetooth}
