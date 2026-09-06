; Recordly 卸载：删除资源管理器右键三棵 HKCU 级联键。
; 菜单由应用按设置写入（默认开），安装器不写菜单，只保证卸载时清干净。
!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\*\shell\Recordly"
  DeleteRegKey HKCU "Software\Classes\directory\shell\Recordly"
  DeleteRegKey HKCU "Software\Classes\directory\background\shell\Recordly"
!macroend
