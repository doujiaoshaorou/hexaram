; First installation: put setup.exe beside the portable app to import its data.
; Stage each item before renaming it so interrupted copies can be retried.
; Never overwrite installed data, copy executables, or remove the originals.
!include "LogicLib.nsh"

!macro HexaramCopyPortableItem NAME LEAF
  ${If} ${FileExists} "$EXEDIR\${NAME}"
  ${AndIfNot} ${FileExists} "$INSTDIR\${NAME}"
    CreateDirectory "$INSTDIR\.portable-import"
    ClearErrors
    CopyFiles /SILENT "$EXEDIR\${NAME}" "$INSTDIR\.portable-import"
    ${IfNot} ${Errors}
      Rename "$INSTDIR\.portable-import\${LEAF}" "$INSTDIR\${NAME}"
    ${EndIf}
    ${If} ${Errors}
      MessageBox MB_OK|MB_ICONSTOP "旧版数据复制失败。原文件仍在原目录，请关闭海斗助手后重新运行安装包。" /SD IDOK
      Abort
    ${EndIf}
    RMDir "$INSTDIR\.portable-import"
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  ; /UPDATE is an installed-app upgrade; its data already lives at $INSTDIR.
  ${If} $UpdateMode <> 1
  ${AndIf} $EXEDIR != $INSTDIR
    !insertmacro HexaramCopyPortableItem "hexaram-config.yaml" "hexaram-config.yaml"
    !insertmacro HexaramCopyPortableItem "hexaram-data" "hexaram-data"
    !insertmacro HexaramCopyPortableItem "device_id" "device_id"
    ${If} ${FileExists} "$EXEDIR\user-data\archives"
      CreateDirectory "$INSTDIR\user-data"
      !insertmacro HexaramCopyPortableItem "user-data\archives" "archives"
    ${EndIf}
  ${EndIf}
!macroend
