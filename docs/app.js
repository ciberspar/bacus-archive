
/* =========================================
   BACUS-ARCHIVE
   Appwrite Cloud integration
   Authentication + Storage + TablesDB
   ========================================= */

"use strict";

const BacusArchive = (() => {
  // -----------------------------------------
  // 1. CONFIGURACIÓN
  // -----------------------------------------

  const CONFIG = {
    endpoint: "https://sfo.cloud.appwrite.io/v1",
    projectId: "6ae3c93f0032a1c9b8b0",
    bucketId: "bacus-archive-files",
    databaseId: "bacus-archive-db",
    tableId: "user-files"
  };

  // -----------------------------------------
  // 2. CLIENTE APPWRITE
  // -----------------------------------------

  if (!window.Appwrite) {
    console.error("No se pudo cargar el SDK de Appwrite.");
    return { init: () => {} };
  }

  const {
    Client,
    Account,
    Storage,
    TablesDB,
    ID,
    Permission,
    Role,
    Query
  } = window.Appwrite;

  const client = new Client()
    .setEndpoint(CONFIG.endpoint)
    .setProject(CONFIG.projectId);

  const account = new Account(client);
  const storage = new Storage(client);
  const tablesDB = new TablesDB(client);

  // -----------------------------------------
  // 3. ELEMENTOS HTML
  // -----------------------------------------

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => document.querySelectorAll(selector);

  const elements = {
    authScreen: $("#authScreen"),
    appScreen: $("#appScreen"),
    authForm: $("#authForm"),
    authName: $("#authName"),
    authNameLabel: $("#authNameLabel"),
    authEmail: $("#authEmail"),
    authPassword: $("#authPassword"),
    authTitle: $("#authTitle"),
    authDescription: $("#authDescription"),
    authSubmit: $("#authSubmit"),
    authSwitch: $("#authSwitch"),
    authMessage: $("#authMessage"),

    userEmail: $("#userEmail"),
    logoutButton: $("#logoutButton"),
    storageStatus: $("#storageStatus"),
    noticeText: $("#noticeText"),

    sidebar: $("#sidebar"),
    menuButton: $("#menuButton"),
    searchInput: $("#searchInput"),
    fileInput: $("#fileInput"),
    fileGrid: $("#fileGrid"),
    emptyState: $("#emptyState"),
    fileCount: $("#fileCount"),
    clearSearch: $("#clearSearch"),

    currentSection: $("#currentSection"),
    pageTitle: $("#pageTitle"),
    pageDescription: $("#pageDescription"),
    libraryTitle: $("#libraryTitle"),
    libraryDescription: $("#libraryDescription"),
    overview: $("#overview"),
    library: $("#library"),
    toast: $("#toast")
  };

  // -----------------------------------------
  // 4. ESTADO
  // -----------------------------------------

  let currentUser = null;
  let files = [];
  let activeFilter = "all";
  let currentView = "inicio";
  let registrationMode = false;
  let busy = false;
  let toastTimeout = null;

  const viewInfo = {
    inicio: {
      label: "Inicio",
      title: "Todo en su lugar.",
      description: "Tus archivos, disponibles desde tus dispositivos."
    },
    archivos: {
      label: "Mis archivos",
      title: "Tus archivos.",
      description: "Tu biblioteca personal en la nube."
    },
    recientes: {
      label: "Recientes",
      title: "Tus archivos recientes.",
      description: "Los archivos subidos más recientemente."
    },
    favoritos: {
      label: "Favoritos",
      title: "Favoritos.",
      description: "La gestión de favoritos estará disponible próximamente."
    },
    papelera: {
      label: "Papelera",
      title: "Papelera.",
      description: "La papelera estará disponible próximamente."
    },
    privacidad: {
      label: "Privacidad",
      title: "Tu privacidad importa.",
      description: "Información sobre el funcionamiento de tu cuenta."
    }
  };

  // -----------------------------------------
  // 5. UTILIDADES
  // -----------------------------------------

  function showMessage(message, error = false) {
    if (!elements.authMessage) return;

    elements.authMessage.textContent = message;
    elements.authMessage.style.color = error
      ? "#b42318"
      : "#167b64";
  }

  function showToast(message) {
    if (!elements.toast) return;

    elements.toast.textContent = message;
    elements.toast.classList.add("visible");

    clearTimeout(toastTimeout);

    toastTimeout = setTimeout(() => {
      elements.toast.classList.remove("visible");
    }, 3500);
  }

  function setBusy(value) {
    busy = value;

    if (elements.authSubmit) {
      elements.authSubmit.disabled = value;
      elements.authSubmit.textContent = value
        ? "Procesando..."
        : registrationMode
          ? "Crear cuenta"
          : "Iniciar sesión";
    }

    if (elements.fileInput) {
      elements.fileInput.disabled = value;
    }
  }

  function formatSize(bytes) {
    const value = Number(bytes);

    if (!Number.isFinite(value) || value < 0) {
      return "Tamaño desconocido";
    }

    if (value === 0) return "0 bytes";

    const units = ["bytes", "KB", "MB", "GB", "TB"];

    const index = Math.min(
      Math.floor(Math.log(value) / Math.log(1024)),
      units.length - 1
    );

    return `${(value / Math.pow(1024, index)).toLocaleString(
      "es-AR",
      { maximumFractionDigits: 2 }
    )} ${units[index]}`;
  }

  function classifyFile(file) {
    const type = file.mimeType || "";
    const name = file.name.toLowerCase();

    if (type.startsWith("image/")) return "image";

    if (
      type.startsWith("text/") ||
      type === "application/pdf" ||
      /\.(pdf|txt|md|rtf|doc|docx|odt|xls|xlsx|csv|ppt|pptx|ods|odp)$/.test(name)
    ) {
      return "document";
    }

    if (
      type.startsWith("audio/") ||
      type.startsWith("video/") ||
      /\.(mp4|mov|webm|mp3|wav|ogg|m4a)$/.test(name)
    ) {
      return "media";
    }

    return "other";
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function setNotice(message) {
    if (elements.noticeText) {
      elements.noticeText.textContent = message;
    }
  }

  function permissionsForUser(userId) {
    return [
      Permission.read(Role.user(userId)),
      Permission.update(Role.user(userId)),
      Permission.delete(Role.user(userId))
    ];
  }

  // -----------------------------------------
  // 6. AUTENTICACIÓN
  // -----------------------------------------

  function setRegistrationMode(enabled) {
    registrationMode = enabled;

    elements.authName.hidden = !enabled;
    elements.authNameLabel.hidden = !enabled;

    elements.authName.required = enabled;

    elements.authPassword.autocomplete = enabled
      ? "new-password"
      : "current-password";

    elements.authTitle.textContent = enabled
      ? "Creá tu espacio."
      : "Tu espacio digital.";

    elements.authDescription.textContent = enabled
      ? "Registrate para empezar a guardar tus archivos."
      : "Iniciá sesión para acceder a tus archivos.";

    elements.authSubmit.textContent = enabled
      ? "Crear cuenta"
      : "Iniciar sesión";

    elements.authSwitch.textContent = enabled
      ? "¿Ya tenés cuenta? Iniciá sesión"
      : "¿No tenés cuenta? Registrate";

    showMessage("");
  }

  async function handleAuthentication(event) {
    event.preventDefault();

    if (busy) return;

    const email = elements.authEmail.value.trim();
    const password = elements.authPassword.value;
    const name = elements.authName.value.trim();

    if (!email || !password) {
      showMessage("Completá el correo y la contraseña.", true);
      return;
    }

    if (registrationMode && !name) {
      showMessage("Escribí tu nombre.", true);
      return;
    }

    setBusy(true);

    try {
      if (registrationMode) {
        await account.create({
          userId: ID.unique(),
          email,
          password,
          name
        });

        // Crear sesión después del registro.
        await account.createEmailPasswordSession({
          email,
          password
        });
      } else {
        await account.createEmailPasswordSession({
          email,
          password
        });
      }

      await loadAuthenticatedUser();

    } catch (error) {
      console.error("Error de autenticación:", error);

      showMessage(
        error.message || "No se pudo completar la autenticación.",
        true
      );
    } finally {
      setBusy(false);
    }
  }

  async function loadAuthenticatedUser() {
    currentUser = await account.get();

    elements.authScreen.hidden = true;
    elements.appScreen.hidden = false;

    elements.userEmail.textContent = currentUser.email;
    elements.storageStatus.textContent = "Conectado";

    setNotice(
      "Conectado a Appwrite. Tus archivos se almacenan en la nube."
    );

    await loadFiles();
  }

  async function logout() {
    if (busy) return;

    try {
      await account.deleteSession({ sessionId: "current" });

      currentUser = null;
      files = [];

      elements.appScreen.hidden = true;
      elements.authScreen.hidden = false;

      elements.authPassword.value = "";
      elements.authEmail.value = "";

      setRegistrationMode(false);
      showMessage("Sesión cerrada correctamente.");

    } catch (error) {
      console.error("Error cerrando sesión:", error);
      showToast("No se pudo cerrar la sesión.");
    }
  }

  // -----------------------------------------
  // 7. METADATOS TABLESDB
  // -----------------------------------------

  async function saveMetadata(file, uploadedFile) {
    const data = {
      ownerId: currentUser.$id,
      fileId: uploadedFile.$id,
      fileName: file.name,
      fileSize: String(file.size),
      mimeType: file.type || "application/octet-stream",
      createdAt: new Date().toISOString()
    };

    return tablesDB.createRow({
      databaseId: CONFIG.databaseId,
      tableId: CONFIG.tableId,
      rowId: ID.unique(),
      data,
      permissions: permissionsForUser(currentUser.$id)
    });
  }

  async function getMetadata() {
    try {
      const response = await tablesDB.listRows({
        databaseId: CONFIG.databaseId,
        tableId: CONFIG.tableId,
        queries: [Query.limit(500)]
      });

      return response.rows || [];
    } catch (error) {
      console.error("Error leyendo metadatos:", error);
      throw error;
    }
  }

  // -----------------------------------------
  // 8. ALMACENAMIENTO
  // -----------------------------------------

  async function loadFiles() {
    if (!currentUser) return;

    setNotice("Cargando tus archivos...");

    try {
      const [storageResponse, rows] = await Promise.all([
        storage.listFiles({
          bucketId: CONFIG.bucketId,
          queries: [Query.limit(500)]
        }),
        getMetadata()
      ]);

      const metadataByFileId = new Map(
        rows.map((row) => [row.fileId, row])
      );

      files = (storageResponse.files || []).map((file) => {
        const metadata = metadataByFileId.get(file.$id);

        return {
          id: file.$id,
          rowId: metadata?.$id || null,
          name: metadata?.fileName || file.name,
          size: metadata?.fileSize ?? String(file.sizeOriginal || 0),
          mimeType: metadata?.mimeType || file.mimeType || "",
          createdAt: metadata?.createdAt || file.$createdAt,
          category: classifyFile({
            name: metadata?.fileName || file.name,
            mimeType: metadata?.mimeType || file.mimeType
          })
        };
      });

      setNotice("Conectado. Tus archivos están en Appwrite Storage.");

      render();

    } catch (error) {
      console.error("Error cargando archivos:", error);

      setNotice(
        "No se pudieron cargar los archivos. Revisá los permisos de Appwrite."
      );

      showToast("Error al cargar la biblioteca.");
    }
  }

  async function uploadFiles(fileList) {
    if (!currentUser || busy) return;

    const selected = Array.from(fileList || []);

    if (!selected.length) return;

    setBusy(true);

    let successful = 0;

    try {
      for (const file of selected) {
        let uploadedFile = null;

        try {
          uploadedFile = await storage.createFile({
            bucketId: CONFIG.bucketId,
            fileId: ID.unique(),
            file,
            permissions: permissionsForUser(currentUser.$id)
          });

          try {
            await saveMetadata(file, uploadedFile);
          } catch (metadataError) {
            // Evitar archivos huérfanos si falla TablesDB.
            await storage.deleteFile({
              bucketId: CONFIG.bucketId,
              fileId: uploadedFile.$id
            });

            throw metadataError;
          }

          successful++;

        } catch (error) {
          console.error(`Error subiendo ${file.name}:`, error);

          showToast(
            `No se pudo subir ${file.name}: ${error.message}`
          );
        }
      }

      await loadFiles();

      if (successful > 0) {
        showToast(
          `${successful} ${successful === 1
            ? "archivo subido"
            : "archivos subidos"} correctamente.`
        );
      }

    } finally {
      setBusy(false);

      if (elements.fileInput) {
        elements.fileInput.value = "";
      }
    }
  }

  async function downloadFile(file) {
    try {
      const result = storage.getFileDownload({
        bucketId: CONFIG.bucketId,
        fileId: file.id
      });

      const link = document.createElement("a");
      link.href = result;
      link.download = file.name;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();

    } catch (error) {
      console.error("Error descargando archivo:", error);
      showToast("No se pudo descargar el archivo.");
    }
  }

  async function deleteFile(file) {
    if (!currentUser || busy) return;

    const confirmed = window.confirm(
      `¿Querés eliminar "${file.name}" de tu nube? Esta acción no se puede deshacer.`
    );

    if (!confirmed) return;

    setBusy(true);

    try {
      // Primero eliminamos los metadatos.
      if (file.rowId) {
        await tablesDB.deleteRow({
          databaseId: CONFIG.databaseId,
          tableId: CONFIG.tableId,
          rowId: file.rowId
        });
      }

      // Después eliminamos el archivo.
      await storage.deleteFile({
        bucketId: CONFIG.bucketId,
        fileId: file.id
      });

      showToast("Archivo eliminado.");
      await loadFiles();

    } catch (error) {
      console.error("Error eliminando archivo:", error);
      showToast("No se pudo eliminar el archivo.");
      await loadFiles();

    } finally {
      setBusy(false);
    }
  }

  // -----------------------------------------
  // 9. INTERFAZ DE ARCHIVOS
  // -----------------------------------------

  function iconForCategory(category) {
    return {
      image: "▧",
      document: "▤",
      media: "♫",
      other: "◇"
    }[category] || "◇";
  }

  function getVisibleFiles() {
    const query = elements.searchInput.value
      .trim()
      .toLocaleLowerCase("es");

    let result = files.filter((file) => {
      const matchesName = file.name
        .toLocaleLowerCase("es")
        .includes(query);

      const matchesCategory =
        activeFilter === "all" ||
        file.category === activeFilter;

      return matchesName && matchesCategory;
    });

    if (currentView === "recientes") {
      result = [...result].sort(
        (a, b) =>
          new Date(b.createdAt) - new Date(a.createdAt)
      );
    }

    return result;
  }

  function createFileCard(file) {
    const card = document.createElement("article");
    card.className = "file-card";

    const preview = document.createElement("div");
    preview.className = "file-preview";
    preview.textContent = iconForCategory(file.category);

    const name = document.createElement("span");
    name.className = "file-name";
    name.textContent = file.name;
    name.title = file.name;

    const meta = document.createElement("span");
    meta.className = "file-meta";
    meta.textContent = formatSize(file.size);

    const actions = document.createElement("div");
    actions.style.cssText =
      "display:flex;flex-wrap:wrap;gap:8px;margin-top:12px";

    const downloadButton = document.createElement("button");
    downloadButton.type = "button";
    downloadButton.className = "text-button";
    downloadButton.textContent = "Descargar";
    downloadButton.addEventListener("click", () => {
      downloadFile(file);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "text-button";
    deleteButton.textContent = "Eliminar";
    deleteButton.addEventListener("click", () => {
      deleteFile(file);
    });

    actions.append(downloadButton, deleteButton);
    card.append(preview, name, meta, actions);

    return card;
  }

  function render() {
    if (!currentUser) return;

    const info = viewInfo[currentView] || viewInfo.inicio;

    elements.currentSection.textContent = info.label;
    elements.pageTitle.textContent = info.title;
    elements.pageDescription.textContent = info.description;

    $$(".nav-link[data-view]").forEach((link) => {
      const active = link.dataset.view === currentView;

      link.classList.toggle("active", active);

      if (active) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });

    const unavailable = [
      "favoritos",
      "papelera",
      "privacidad"
    ].includes(currentView);

    elements.overview.hidden = unavailable;
    elements.library.hidden = false;
    elements.fileGrid.hidden = unavailable;
    elements.emptyState.hidden = unavailable;

    if (unavailable) {
      elements.libraryTitle.textContent = info.label;
      elements.libraryDescription.textContent = info.description;

      elements.fileGrid.replaceChildren();
      elements.emptyState.hidden = false;

      const heading = elements.emptyState.querySelector("h3");
      const paragraph = elements.emptyState.querySelector("p");
      const label = elements.emptyState.querySelector("label");
      const small = elements.emptyState.querySelector("small");

      heading.textContent = info.label;
      paragraph.textContent = info.description;
      label.hidden = true;
      small.textContent =
        "Esta función todavía no está implementada.";

      elements.fileCount.textContent = "0 archivos";
      return;
    }

    const visible = getVisibleFiles();

    elements.libraryTitle.textContent =
      currentView === "recientes"
        ? "Archivos recientes"
        : "Archivos en la nube";

    elements.libraryDescription.textContent =
      "Archivos almacenados en tu cuenta de Appwrite.";

    elements.fileGrid.replaceChildren();

    visible.forEach((file) => {
      elements.fileGrid.appendChild(createFileCard(file));
    });

    elements.fileCount.textContent =
      `${visible.length} ${visible.length === 1 ? "archivo" : "archivos"}`;

    elements.emptyState.hidden = visible.length > 0;

    const heading = elements.emptyState.querySelector("h3");
    const paragraph = elements.emptyState.querySelector("p");
    const label = elements.emptyState.querySelector("label");
    const small = elements.emptyState.querySelector("small");

    heading.textContent = elements.searchInput.value
      ? "No encontramos resultados"
      : "Tu espacio está listo";

    paragraph.textContent = elements.searchInput.value
      ? "Probá con otro nombre o limpiá la búsqueda."
      : "Subí archivos para guardarlos en tu nube.";

    label.hidden = false;
    small.textContent = "Los archivos se guardan en Appwrite Storage.";
  }

  // -----------------------------------------
  // 10. NAVEGACIÓN
  // -----------------------------------------

  function closeMenu() {
    elements.sidebar.classList.remove("open");
    elements.menuButton.setAttribute("aria-expanded", "false");
  }

  function navigate(view) {
    if (!viewInfo[view]) return;

    currentView = view;
    activeFilter = "all";

    elements.searchInput.value = "";

    closeMenu();
    render();

    if (location.hash !== `#${view}`) {
      history.replaceState(null, "", `#${view}`);
    }
  }

  function applyCategoryFilter(category) {
    activeFilter = category;
    currentView = "archivos";

    render();
  }

  // -----------------------------------------
  // 11. EVENTOS
  // -----------------------------------------

  function bindEvents() {
    elements.authForm.addEventListener(
      "submit",
      handleAuthentication
    );

    elements.authSwitch.addEventListener("click", () => {
      setRegistrationMode(!registrationMode);
    });

    elements.logoutButton.addEventListener("click", logout);

    elements.fileInput.addEventListener("change", (event) => {
      uploadFiles(event.target.files);
    });

    elements.searchInput.addEventListener("input", render);

    elements.clearSearch.addEventListener("click", () => {
      elements.searchInput.value = "";
      render();
      elements.searchInput.focus();
    });

    elements.menuButton.addEventListener("click", () => {
      const open = elements.sidebar.classList.toggle("open");

      elements.menuButton.setAttribute(
        "aria-expanded",
        String(open)
      );
    });

    $$(".nav-link[data-view]").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        navigate(link.dataset.view);
      });
    });

    $$("[data-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        applyCategoryFilter(button.dataset.filter);
      });
    });

    document.addEventListener("keydown", (event) => {
      const target = event.target;

      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (event.key === "/" && !typing && currentUser) {
        event.preventDefault();
        elements.searchInput.focus();
      }

      if (event.key === "Escape") {
        closeMenu();
      }
    });

    window.addEventListener("hashchange", () => {
      const requested = location.hash.slice(1);

      if (viewInfo[requested] && requested !== currentView) {
        navigate(requested);
      }
    });
  }

  // -----------------------------------------
  // 12. INICIALIZACIÓN
  // -----------------------------------------

  async function init() {
    bindEvents();
    setRegistrationMode(false);

    elements.authScreen.hidden = false;
    elements.appScreen.hidden = true;

    try {
      await loadAuthenticatedUser();

      const initialView = location.hash.slice(1);

      if (viewInfo[initialView]) {
        navigate(initialView);
      }

    } catch (error) {
      // No hay sesión activa: mostrar acceso.
      console.info("No hay una sesión activa:", error.message);

      currentUser = null;
      elements.authScreen.hidden = false;
      elements.appScreen.hidden = true;
    }
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", BacusArchive.init);
