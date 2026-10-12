// Login/cookie filtering and Keychain patterns adapted with author permission
// from Andre-HUANG/polyu-study-console MacApp/App.swift and SessionVault.swift.
import AppKit
import WebKit
import Security

func output(_ value: [String: Any], code: Int32 = 0) -> Never {
    var result = value; result["version"] = 1
    if let data = try? JSONSerialization.data(withJSONObject: result) { FileHandle.standardOutput.write(data) }
    exit(code)
}
let inputData = FileHandle.standardInput.readDataToEndOfFile()
guard let request = (try? JSONSerialization.jsonObject(with: inputData)) as? [String: Any], request["version"] as? Int == 1, let operation = request["operation"] as? String else { output(["error":"Invalid bridge request"],code:1) }

final class Login: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKScriptMessageHandler, NSWindowDelegate, WKUIDelegate {
    var window: NSWindow!; var view: WKWebView!; var finishing = false; var popups: [NSWindow] = []
    func applicationDidFinishLaunching(_ notification: Notification) {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController.add(self, name:"canvasLogin")
        let js = """
        (()=>{if(location.origin!=='https://canvas.polyu.edu.hk')return;
        let busy=false;async function check(){if(busy)return;busy=true;try{
        if(!document.querySelector('#global_nav_dashboard_link'))return;
        let user=null;try{let r=await fetch('/api/v1/users/self');if(r.ok)user=await r.json()}catch(e){}
        if(!user||!user.id){let env=window.ENV||{};if(env.current_user_id)user={id:env.current_user_id,name:env.current_user?.display_name||env.current_user?.name||'Canvas 用户'}}
        if(user&&user.id)window.webkit.messageHandlers.canvasLogin.postMessage({id:String(user.id),name:user.name||user.short_name||'Canvas 用户'});
        }finally{busy=false}}check();setInterval(check,3000)})();
        """
        configuration.userContentController.addUserScript(WKUserScript(source:js,injectionTime:.atDocumentEnd,forMainFrameOnly:true))
        view = WKWebView(frame:.zero,configuration:configuration); view.navigationDelegate=self;view.uiDelegate=self
        window = NSWindow(contentRect:NSRect(x:0,y:0,width:1030,height:760),styleMask:[.titled,.closable,.resizable,.miniaturizable],backing:.buffered,defer:false)
        window.title="登录并授权 · PolyU Canvas";window.contentView=view;window.delegate=self;window.isReleasedWhenClosed=false;window.center();window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps:true)
        view.load(URLRequest(url:URL(string:"https://canvas.polyu.edu.hk")!))
    }
    func userContentController(_ userContentController: WKUserContentController,didReceive message:WKScriptMessage) {
        guard !finishing, message.frameInfo.isMainFrame, message.frameInfo.securityOrigin.host == "canvas.polyu.edu.hk", let user=message.body as? [String:Any], let id=user["id"] as? String, id.range(of:"^[0-9]+$",options:.regularExpression) != nil else{return}
        finishing=true
        view.configuration.websiteDataStore.httpCookieStore.getAllCookies { cookies in
            let rows:[[String:Any]]=cookies.filter { let domain=$0.domain.trimmingCharacters(in:CharacterSet(charactersIn:"."));return domain=="canvas.polyu.edu.hk" || domain=="polyu.edu.hk" }.map { cookie in
                ["name":cookie.name,"value":cookie.value,"path":cookie.path,"expires":cookie.expiresDate?.timeIntervalSince1970 ?? -1]
            }
            output(["user":user,"cookies":rows])
        }
    }
    func windowWillClose(_ notification:Notification){if (notification.object as? NSWindow) === window {output(["cancelled":true])}}
    func webView(_ webView:WKWebView,createWebViewWith configuration:WKWebViewConfiguration,for navigationAction:WKNavigationAction,windowFeatures:WKWindowFeatures)->WKWebView? {
        let popup=WKWebView(frame:.zero,configuration:configuration);popup.navigationDelegate=self;popup.uiDelegate=self
        let win=NSWindow(contentRect:NSRect(x:0,y:0,width:900,height:700),styleMask:[.titled,.closable,.resizable],backing:.buffered,defer:false);win.contentView=popup;win.title="学校身份验证";win.isReleasedWhenClosed=false;win.center();win.makeKeyAndOrderFront(nil);popups.append(win);return popup
    }
    func webViewDidClose(_ webView:WKWebView){popups.first(where:{$0.contentView===webView})?.close()}
    func webView(_ webView:WKWebView,decidePolicyFor action:WKNavigationAction,decisionHandler:@escaping(WKNavigationActionPolicy)->Void){guard let scheme=action.request.url?.scheme, ["https","about"].contains(scheme) else{decisionHandler(.cancel);return};decisionHandler(.allow)}
}
if operation.hasPrefix("key-") {
    guard let account=request["account"] as? String, account.count<=200 else{output(["error":"Invalid key account"],code:1)}
    var query:[String:Any]=[kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"local.polyu.canvas.localized.v1",kSecAttrAccount as String:account]
    var testKeychain: SecKeychain?
    #if DEBUG
    if let keychainPath=request["testKeychain"] as? String {
        SecKeychainSetUserInteractionAllowed(false)
        let status=SecKeychainOpen(keychainPath, &testKeychain)
        guard status==errSecSuccess, let chain=testKeychain else {output(["error":"test keychain open failed"],code:1)}
        query[kSecMatchSearchList as String]=[chain]
    }
    #endif
    if operation=="key-get" {
        query[kSecReturnData as String]=true;query[kSecMatchLimit as String]=kSecMatchLimitOne
        var item:CFTypeRef?;let status=SecItemCopyMatching(query as CFDictionary,&item)
        if status==errSecItemNotFound{output(["value":""])}
        guard status==errSecSuccess,let data=item as? Data,let value=String(data:data,encoding:.utf8)else{output(["error":"钥匙串读取失败（\(status)）"],code:1)}
        output(["value":value])
    }else if operation=="key-delete"{let status=SecItemDelete(query as CFDictionary);guard status==errSecSuccess || status==errSecItemNotFound else{output(["error":"钥匙串删除失败"],code:1)};output(["ok":true])
    }else if operation=="key-set"{
        guard let value=request["value"] as? String else{output(["error":"Invalid value"],code:1)}
        let data=Data(value.utf8);var status=SecItemUpdate(query as CFDictionary,[kSecValueData as String:data] as CFDictionary)
        if status==errSecItemNotFound{query.removeValue(forKey:kSecMatchSearchList as String);if let chain=testKeychain{query[kSecUseKeychain as String]=chain};query[kSecValueData as String]=data;status=SecItemAdd(query as CFDictionary,nil)}
        guard status==errSecSuccess else{output(["error":"钥匙串写入失败（\(status)）"],code:1)};output(["ok":true])
    }
}
let app=NSApplication.shared
app.setActivationPolicy(.regular)
if operation=="login" {let delegate=Login();app.delegate=delegate;app.run();withExtendedLifetime(delegate){} }
else{output(["error":"Unsupported operation"],code:1)}
