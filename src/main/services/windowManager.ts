import setIpc from './ipcMain'
import config from '@config/index'
import menuconfig from '../config/menu'
import Update from './checkupdate';
import { app, BrowserWindow, Menu, dialog } from 'electron'
import { winURL, loadingURL } from '../config/StaticPath'
import { platform } from 'os';
import Store from 'electron-store'
import path from 'path';
// 初始化
Store.initRenderer();

class MainInit {

  public winURL: string = ''
  public shartURL: string = ''
  public loadWindow: BrowserWindow = null
  public mainWindow: BrowserWindow = null

  constructor() {
    this.winURL = winURL
    this.shartURL = loadingURL
    if (process.env.NODE_ENV === 'development') {
      menuconfig.push({
        label: '开发者设置',
        submenu: [{
          label: '切换到开发者模式',
          accelerator: 'CmdOrCtrl+I',
          role: 'toggledevtools'
        }]
      })
    }
    // 启用协议
    setIpc.Mainfunc(config.IsUseSysTitle)
  }


  // 主窗口函数
  createMainWindow() {
    this.mainWindow = new BrowserWindow({
      height: 680,
      useContentSize: true,
      width: 900,
      minWidth: 900,
      minHeight: 680,
      resizable: true,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      titleBarStyle: config.IsUseSysTitle ? 'default' : 'hidden',
      icon: path.join(__dirname, './build/icons/favicon.ico'),
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true,
        webSecurity: false,
        // 如果是开发模式可以使用devTools
        devTools: process.env.NODE_ENV === 'development',
        // 在macos中启用橡皮动画
        scrollBounce: process.platform === 'darwin'
      }
    })

    function preventDragbarContext(mainWindow) {

      const WM_INITMENU = 0x116;//278
      mainWindow.hookWindowMessage(WM_INITMENU, function (e) {
        mainWindow.setEnabled(false);
        setTimeout(() => {
          mainWindow.setEnabled(true);
        }, 50);
        return true;
      })
    }

    preventDragbarContext(this.mainWindow)

    const gotTheLock = app.requestSingleInstanceLock()
    if (!gotTheLock) {
      app.quit()
    } else {
      app.on('second-instance', (event, commandLine, workingDirectory) => {
        // 当运行第二个实例时,将会聚焦到mainWindow这个窗口
        if (this.mainWindow) {
          if (this.mainWindow.isMinimized()) this.mainWindow.restore()
          this.mainWindow.focus()
          this.mainWindow.show()
        }
      })
    }
    // 赋予模板
    const menu = Menu.buildFromTemplate(menuconfig as any)
    // 加载模板
    Menu.setApplicationMenu(menu)
    // 加载主窗口
    this.mainWindow.loadURL(this.winURL)
    // electron-update注册
    new Update(this.mainWindow)
    // dom-ready之后显示界面
    this.mainWindow.webContents.once('dom-ready', () => {
      this.mainWindow.show()
      if (config.UseStartupChart) this.loadWindow.destroy()
    })
    // this.mainWindow.webContents.openDevTools()
    // 开发模式下自动开启devtools
    if (process.env.NODE_ENV === 'development') {
      this.mainWindow.webContents.openDevTools({ mode: 'undocked', activate: true })
    }
    // 当确定渲染进程卡死时，分类型进行告警操作
    app.on('render-process-gone', (event, webContents, details) => {
      const message = {
        title: "",
        buttons: [],
        message: '',
      }
      switch (details.reason) {
        case 'crashed':
          message.title = "警告"
          message.buttons = ['确定', '退出']
          message.message = "进程崩溃，是否进行软重启操作？"
          break;
        case 'killed':
          message.title = "警告"
          message.buttons = ['确定', '退出']
          message.message = "由于未知原因导致图形化进程被终止，是否进行软重启操作？"
          break;
        case 'oom':
          message.title = "警告"
          message.buttons = ['确定', '退出']
          message.message = "内存不足，是否软重启释放内存？"
          break;

        default:
          break;
      }
      dialog.showMessageBox(this.mainWindow, {
        type: 'warning',
        title: message.title,
        buttons: message.buttons,
        message: message.message,
        noLink: true
      }).then(res => {
        if (res.response === 0) this.mainWindow.reload()
        else this.mainWindow.close()
      })
    })
    // 不知道什么原因，反正就是这个窗口里的页面触发了假死时执行
    this.mainWindow.on('unresponsive', () => {
      dialog.showMessageBox(this.mainWindow, {
        type: 'warning',
        title: '提示',
        buttons: ['重载', '退出'],
        message: '进程失去响应，是否等待其恢复？',
        noLink: true
      }).then(res => {
        if (res.response === 0) this.mainWindow.reload()
        else this.mainWindow.close()
      })
    })
    /**
     * 新的gpu崩溃检测，详细参数详见：http://www.electronjs.org/docs/api/app
     * @returns {void}
     * @date 2020-11-27
     */
    app.on('child-process-gone', (event, details) => {
      const message = {
        title: "",
        buttons: [],
        message: '',
      }
      switch (details.type) {
        case 'GPU':
          switch (details.reason) {
            case 'crashed':
              message.title = "警告";
              message.buttons = ['确定', '退出'];
              message.message = "硬件加速进程已崩溃，是否关闭硬件加速并重启？";
              break;
            case 'killed':
              message.title = "警告";
              message.buttons = ['确定', '退出'];
              message.message = "硬件加速进程被意外终止，是否关闭硬件加速并重启？";
              break;
            default:
              break;
          }
          break;

        default:
          break;
      }
      dialog.showMessageBox(this.mainWindow, {
        type: 'warning',
        title: message.title,
        buttons: message.buttons,
        message: message.message,
        noLink: true
      }).then(res => {
        // 当显卡出现崩溃现象时使用该设置禁用显卡加速模式。
        if (res.response === 0) {
          if (details.type === 'GPU') app.disableHardwareAcceleration();
          this.mainWindow.reload()
        } else {
          this.mainWindow.close()
        }
      })
    })
    this.mainWindow.on('closed', () => {
      this.mainWindow = null
    })
  }
  // 加载窗口函数
  loadingWindow(loadingURL: string) {
    this.loadWindow = new BrowserWindow({
      width: 400,
      height: 400,
      frame: false,
      skipTaskbar: true,
      transparent: true,
      resizable: false,
      webPreferences: { experimentalFeatures: true }
    })

    this.loadWindow.loadURL(loadingURL)
    this.loadWindow.show()
    this.loadWindow.setAlwaysOnTop(true)
    // 延迟两秒可以根据情况后续调快，= =，就相当于个，sleep吧，就那种
    setTimeout(() => {
      this.createMainWindow()
    }, 1000)
  }
  // 初始化窗口函数
  initWindow() {
    if (config.UseStartupChart) {
      return this.loadingWindow(this.shartURL)
    } else {
      return this.createMainWindow()
    }

  }
}
export default MainInit
