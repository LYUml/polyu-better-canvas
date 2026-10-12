import Foundation
import AppKit
import PDFKit
let root=CommandLine.arguments[1]
try FileManager.default.createDirectory(atPath:root,withIntermediateDirectories:true)
let text="Assignment deadline 2026-11-20 23:59"
let url=URL(fileURLWithPath:root+"/text.pdf")
var bounds=CGRect(x:0,y:0,width:612,height:792)
let context=CGContext(url as CFURL,mediaBox:&bounds,nil)!
context.beginPDFPage(nil)
NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(cgContext:context,flipped:false)
(text as NSString).draw(at:NSPoint(x:60,y:650),withAttributes:[.font:NSFont.systemFont(ofSize:20),.foregroundColor:NSColor.black])
NSGraphicsContext.restoreGraphicsState();context.endPDFPage();context.closePDF()
let image=NSImage(size:NSSize(width:1224,height:1584));image.lockFocus();NSColor.white.setFill();NSRect(x:0,y:0,width:1224,height:1584).fill();(text as NSString).draw(at:NSPoint(x:100,y:1300),withAttributes:[.font:NSFont.systemFont(ofSize:36),.foregroundColor:NSColor.black]);image.unlockFocus()
let document=PDFDocument();document.insert(PDFPage(image:image)!,at:0);document.write(to:URL(fileURLWithPath:root+"/scan.pdf"))
