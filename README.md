# MYM Comercial ERP V13.9

Entrega consolidada de MYM Comercial ERP. La aplicación, módulos, formularios y documentación operativa utilizan una sola versión: **V13.9**.

## Publicación en Vercel

Suba el contenido completo del paquete conservando la estructura de carpetas. Vercel debe utilizar la raíz del proyecto, donde se encuentran:

- `index.html`: sitio web público.
- `site.css` y `site.js`: diseño y funciones del sitio público.
- `vercel.json`: rutas de publicación.
- `app/`: sistema administrativo accesible desde `/app/`.

No configure `app` como Root Directory, porque eso excluiría el sitio web público.

## Incluye

- Dashboard multiunidad.
- POS, inventario, clientes, cajas y etiquetas.
- Impresión y reimpresión térmica.
- Ventas y ganancia diaria.
- Historial filtrable por fecha.
- Reportes y gráficos de comportamiento.
- Precios calculados con margen real de 35%, 40%, 50% o porcentaje personalizado.
- Precio de venta manual con cálculo del margen resultante.
- Política de descuento manual persistente.
- Anulación auditable de ventas.
- Conexión automática después del ingreso.
- Eliminación segura de productos duplicados desde Inventario.
- Desactivación sin pérdida de historial cuando el producto ya tiene movimientos.

## Supabase

Ejecute una sola vez antes de publicar:

1. `supabase/schema_v13_8_unificacion.sql`
2. `supabase/schema_v13_9_eliminar_productos.sql`

La migración convierte los precios automáticos existentes a margen real sobre
la venta. Los productos marcados con precio manual no se modifican.

La segunda migración agrega el borrado seguro: solo un administrador puede
eliminar definitivamente un producto sin historial. Si ya tiene ventas,
importaciones o movimientos, se conserva y puede desactivarse.

Para revisar los resultados sin modificar datos, ejecute:

`supabase/validar_v13_9_eliminar_productos.sql`
