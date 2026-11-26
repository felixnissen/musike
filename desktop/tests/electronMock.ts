// Test-only Electron shim; no actual credentials or operating-system keychain are used.
let onOpen:(url:string)=>Promise<void>=async()=>{};
export const setOpenHandler=(fn:(url:string)=>Promise<void>)=>{onOpen=fn;};
export const app={getPath:()=>process.env.MUSIKE_TEST_USER_DATA!};
export const shell={openExternal:(url:string)=>onOpen(url)};
export const safeStorage={isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=>"test",encryptString:(s:string)=>Buffer.from(s),decryptString:(b:Buffer)=>b.toString()};
