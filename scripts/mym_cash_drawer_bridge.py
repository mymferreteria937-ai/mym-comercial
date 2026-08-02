"""Puente local MYM para abrir un cajón conectado a una impresora ESC/POS.

Escucha únicamente en 127.0.0.1:18181. Requiere Windows y pywin32.
"""
import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    import win32print
except ImportError as exc:
    raise SystemExit("Falta pywin32. Ejecute: py -m pip install pywin32") from exc


DRAWER_PULSE = b"\x1b\x70\x00\x19\xfa"


def send_drawer_pulse(printer_name: str) -> None:
    printer = win32print.OpenPrinter(printer_name)
    try:
        job = win32print.StartDocPrinter(printer, 1, ("MYM - Abrir cajon", None, "RAW"))
        try:
            win32print.StartPagePrinter(printer)
            win32print.WritePrinter(printer, DRAWER_PULSE)
            win32print.EndPagePrinter(printer)
        finally:
            win32print.EndDocPrinter(printer)
    finally:
        win32print.ClosePrinter(printer)


class DrawerHandler(BaseHTTPRequestHandler):
    default_printer = ""

    def _headers(self, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.end_headers()

    def _json(self, data, status=200):
        self._headers(status)
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def do_OPTIONS(self):
        self._headers(204)

    def do_GET(self):
        if self.path == "/health":
            return self._json({"ok": True, "service": "MYM cash drawer bridge"})
        self._json({"ok": False, "error": "Ruta no encontrada"}, 404)

    def do_POST(self):
        if self.path != "/drawer":
            return self._json({"ok": False, "error": "Ruta no encontrada"}, 404)
        try:
            size = min(int(self.headers.get("Content-Length", "0") or 0), 4096)
            body = json.loads(self.rfile.read(size) or b"{}")
            printer_name = str(body.get("printer_name") or self.default_printer).strip()
            if not printer_name:
                raise ValueError("Indique el nombre de la impresora de Windows.")
            send_drawer_pulse(printer_name)
            self._json({"ok": True, "printer_name": printer_name})
        except Exception as exc:  # El mensaje se muestra en el equipo local.
            self._json({"ok": False, "error": str(exc)}, 500)

    def log_message(self, fmt, *args):
        print("MYM:", fmt % args)


def main():
    parser = argparse.ArgumentParser(description="Puente local del cajón MYM")
    parser.add_argument("--printer", default="", help="Nombre exacto de la impresora en Windows")
    parser.add_argument("--port", type=int, default=18181)
    args = parser.parse_args()
    DrawerHandler.default_printer = args.printer
    server = ThreadingHTTPServer(("127.0.0.1", args.port), DrawerHandler)
    print(f"Puente MYM activo en http://127.0.0.1:{args.port}")
    print("Deje esta ventana abierta mientras usa el sistema.")
    server.serve_forever()


if __name__ == "__main__":
    main()
