import {ref} from 'vue'
export const modeOptions=ref([{label:'全部海克斯',value:0,key:0},{label:'普通海克斯',value:2400,key:2400},{label:'巅峰赛',value:2410,key:2410},{label:'经典版',value:2450,key:2450}])
export async function initModeOptions() { /* Dedicated mode options are available offline. */ }
