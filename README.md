# MM Ferretería ERP - V8.5 Cierre con detalle de ventas

Esta versión agrega al módulo de Cajas y Cierres:

- Resumen de caja chica / fondo inicial C$ y US$ antes del cierre.
- Fecha y hora de apertura visibles en el cierre.
- Resumen por método de pago: efectivo, tarjeta, transferencia y mixto.
- Cambio entregado durante el turno.
- Tabla de ventas del turno.
- Tabla de productos vendidos antes de cerrar caja.
- Ticket de cierre con productos vendidos.

No requiere cambios de base de datos si ya existen las tablas `sales` y `sale_items` del esquema V7.

## Levantar local

Desde la carpeta `app`:

```cmd
python -m http.server 5500
```

Abrir:

```text
http://localhost:5500
```


## V9 - Inventario profesional y etiquetas

Cambios incluidos:
- SKU automático por categoría: `MM-HER-000001`, `MM-PLO-000001`, `MM-ELE-000001`, etc.
- El código de barras usa el mismo SKU interno y se imprime como Code 128 con JsBarcode.
- Buscador inteligente en POS e inventario por SKU, barcode, código proveedor/fabricante, nombre, marca, categoría, ubicación y alias/sinónimos.
- Etiquetas corregidas: 50x30 mm, 70x40 mm y hoja Carta/A4, con precio dentro de la etiqueta.
- Impresión de etiquetas sin imprimir toda la interfaz.
- Centro de alertas en Dashboard: stock crítico, margen bajo, productos sin ventas y cajas abiertas desde ayer.

SQL opcional:
- `supabase/schema_v9_inventario.sql` prepara columnas y tabla de historial de precios.
- No es obligatorio para abrir el sistema, pero sí recomendado para crecer ordenadamente.


## V9.1 Centro de Etiquetas
- Módulo de Códigos/Etiquetas convertido en centro integrado con inventario.
- Lista de productos con SKU, código de barras, código fabricante, precio, stock y última impresión.
- Vista previa lateral de etiqueta 50x30mm / 70x40mm / hoja.
- Estado visual: etiqueta impresa o pendiente.
- Reimpresión directa desde cada fila.
- Registro local de última impresión por producto.


## V9.3 Inventario Profesional

Mejoras incluidas:
- Dashboard de inventario con KPIs: productos, inventario valorizado, stock bajo, agotados y sin movimiento.
- Nueva vista de inventario por tarjetas profesionales.
- Filtros por categoría, estado de stock y accesos rápidos: stock bajo, sin movimiento, margen bajo y sin etiqueta.
- Ficha lateral del producto con SKU, barcode, costos, precio, margen, utilidad, stock, ubicación, punto sugerido de compra, estado de etiqueta y resumen de ventas.
- Acceso directo desde cada producto al Centro de Etiquetas.
- Preparado para futura migración V9 de Kardex real, historial de precios y movimientos de inventario.

No requiere SQL nuevo para abrir el sistema. Para una operación completa futura se recomienda la migración V9 de inventario.


## V10.4 Multiunidad Real

Antes de publicar ejecutar `supabase/schema_v10_4_multiunidad_real.sql` en Supabase. Esta versión corrige el filtro Ferretería/Librería y guarda la unidad de negocio en cada línea de venta.
