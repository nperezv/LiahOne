# Registro de Actividades de Tratamiento (RAT)
**Artículo 30 del Reglamento (UE) 2016/679 — RGPD**

---

## 1. Datos del Responsable del Tratamiento

| Campo | Datos |
|---|---|
| **Nombre** | Nelson Perez |
| **Cargo** | Obispo del Barrio Madrid 8 |
| **Organización** | Barrio Madrid 8 — Estaca Madrid Centro |
| **Entidad religiosa** | La Iglesia de Jesucristo de los Santos de los Últimos Días |
| **Dirección** | Madrid, España |
| **Correo de contacto** | nelson.perez.tp@gmail.com |
| **Naturaleza jurídica** | Organización religiosa sin ánimo de lucro |

No se ha designado Delegado de Protección de Datos (DPD) al no superar los umbrales que lo hacen obligatorio para organizaciones religiosas de este tamaño (Art. 37 RGPD).

---

## 2. Finalidades del Tratamiento

| ID | Finalidad | Base jurídica |
|---|---|---|
| F1 | Directorio interno de miembros del barrio para coordinación pastoral | Art. 9.2.d RGPD — organización religiosa que trata datos de sus propios miembros |
| F2 | Envío de comunicaciones pastorales por correo electrónico | Art. 6.1.a RGPD — consentimiento explícito del interesado |
| F3 | Contacto telefónico para coordinación pastoral | Art. 6.1.a RGPD — consentimiento explícito del interesado |
| F4 | Gestión de entrevistas, asignaciones y reuniones internas | Art. 9.2.d RGPD — organización religiosa / Art. 6.1.f RGPD — interés legítimo |
| F5 | Gestión de solicitudes de acceso, rectificación y supresión | Art. 6.1.c RGPD — obligación legal |

---

## 3. Categorías de Interesados y Datos Tratados

### 3.1 Miembros del barrio (directorio)

| Dato | Obligatorio | Justificación |
|---|---|---|
| Nombre y apellidos | Sí | Identificación del miembro |
| Sexo | Sí | Asignación pastoral (organizaciones por sexo) |
| Fecha de nacimiento | Sí | Cumpleaños, asignación a organizaciones por edad |
| Teléfono | No | Contacto pastoral, solo con consentimiento |
| Correo electrónico | No | Comunicaciones, solo con consentimiento |
| Estado civil | No | Asignación a organizaciones (jóvenes adultos, adultos) |
| Organización eclesiástica | No | Coordinación interna |
| Consentimiento de contacto | Sí | Registro de la base jurídica |
| Fecha de consentimiento | Sí | Trazabilidad del consentimiento |

> **Nota:** La pertenencia a una iglesia es dato de categoría especial (Art. 9 RGPD — creencias religiosas). La base jurídica aplicable es el Art. 9.2.d: organización religiosa que trata datos exclusivamente de sus propios miembros con fines pastorales internos.

### 3.2 Usuarios con cuenta de acceso (líderes)

| Dato | Justificación |
|---|---|
| Nombre y apellidos | Identificación |
| Correo electrónico | Autenticación y notificaciones internas |
| Contraseña (hash bcrypt) | Autenticación — nunca almacenada en texto plano |
| Rol eclesiástico | Control de acceso por función |
| IP y evento de login | Seguridad y auditoría |

### 3.3 Menores de edad

Los menores de **14 años** (límite establecido por la LOPDGDD española) no pueden registrarse de forma autónoma. Su registro requiere la intervención directa de sus padres o tutores legales a través del secretario del barrio, que documenta el consentimiento parental.

---

## 4. Encargados del Tratamiento (Terceros)

| Encargado | Servicio | País | Base de transferencia | DPA firmado |
|---|---|---|---|---|
| **Brevo SAS** | Envío de correo electrónico (SMTP) | Francia (UE) | Art. 46 RGPD — dentro del EEE | Pendiente — firmar en panel Brevo |
| **Cloudflare, Inc.** | Proxy inverso / CDN | EEUU | Cláusulas Contractuales Estándar (SCC) — Art. 46.2.c RGPD | Disponible en panel Cloudflare |
| **Let's Encrypt (ISRG)** | Certificados SSL/TLS | EEUU | No procesa datos personales — solo metadatos de dominio | No aplica |

El servidor de base de datos es **autoalojado** (RHEL 9.5, Madrid). No se usan servicios en la nube para almacenamiento de la base de datos principal.

---

## 5. Plazos de Conservación

| Categoría de dato | Plazo de conservación |
|---|---|
| Datos de miembros activos | Mientras el interesado sea miembro activo del barrio |
| Datos de miembros que causan baja | 12 meses desde la solicitud de baja, salvo obligación legal |
| Logs de acceso y seguridad | 6 meses |
| Consentimientos registrados | 5 años desde la revocación (evidencia de cumplimiento) |
| Solicitudes de ejercicio de derechos | 3 años (plazo de prescripción de reclamaciones ante la AEPD) |

---

## 6. Medidas de Seguridad Técnicas y Organizativas

### Técnicas
- Cifrado en tránsito: HTTPS/TLS mediante Let's Encrypt (certificado renovado automáticamente)
- Contraseñas almacenadas con hash bcrypt (factor de coste ≥ 10)
- Autenticación basada en sesión con cookies HTTP-only
- Control de acceso basado en roles (RBAC): cada usuario solo accede a los datos que su función requiere
- Servidor autoalojado en red privada — no expuesto directamente a internet sin proxy inverso (Cloudflare)
- Copias de seguridad regulares de la base de datos PostgreSQL

### Organizativas
- Acceso restringido a líderes con llamamiento activo y cuenta autorizada
- Registro de eventos de login (IP, fecha, hora)
- Los datos no se comparten con terceros fuera de los encargados del tratamiento listados
- Los datos no se usan con fines comerciales, de marketing ni se ceden a otras organizaciones
- Procedimiento de baja: solicitud vía `/baja`, procesada en máximo 30 días

---

## 7. Derechos de los Interesados

Los interesados pueden ejercer los siguientes derechos dirigiéndose al responsable del tratamiento (nelson.perez.tp@gmail.com) o a través de la página `/baja` de la aplicación:

| Derecho | Artículo RGPD | Plazo de respuesta |
|---|---|---|
| Acceso | Art. 15 | 1 mes |
| Rectificación | Art. 16 | 1 mes |
| Supresión ("derecho al olvido") | Art. 17 | 30 días |
| Limitación del tratamiento | Art. 18 | 1 mes |
| Portabilidad | Art. 20 | 1 mes |
| Oposición | Art. 21 | Inmediato (cese del tratamiento) |

En caso de no obtener respuesta satisfactoria, el interesado puede presentar reclamación ante la **Agencia Española de Protección de Datos (AEPD)**: [www.aepd.es](https://www.aepd.es)

---

## 8. Procedimiento ante Brecha de Seguridad

En caso de brecha de seguridad que afecte a datos personales:

1. **Detección** → documentar naturaleza, categorías y número aproximado de afectados
2. **Evaluación** → determinar si supone riesgo para los derechos y libertades de los interesados
3. **Notificación a la AEPD** → en un plazo máximo de **72 horas** desde el conocimiento de la brecha (Art. 33 RGPD), usando el formulario de notificación de la AEPD
4. **Notificación a interesados** → si la brecha supone alto riesgo (Art. 34 RGPD), notificar a los afectados sin dilación indebida
5. **Documentación** → registrar la brecha, las medidas adoptadas y el resultado

Contacto AEPD para notificación de brechas: [sedeagpd.gob.es](https://sedeagpd.gob.es)

---

## 9. Historial de Revisiones

| Versión | Fecha | Motivo |
|---|---|---|
| 1.0 | 2026-04-22 | Creación inicial del RAT |

---

*Documento elaborado conforme al Art. 30 del Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018 (LOPDGDD).*
*Responsable del tratamiento: Nelson Perez — Obispo del Barrio Madrid 8, Estaca Madrid Centro.*
