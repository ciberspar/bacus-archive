
/* =========================================
   BACUS-ARCHIVE
   Frontend application
   Local browser demo — no backend
   ========================================= */

"use strict";

const BacusArchive = (() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => document.querySelectorAll(selector);

  const elements = {
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
    toast: $("#toast"),
    overview: $("#overview"),
    library: $("#library")
  };

  // Archivos seleccionados: permanecen en memoria durante esta sesión.
  // No se suben a ningún servidor.
  let files = [];
  let activeFilter = "all";
  let currentView = "inicio";
  let toastTimeout = null;

  const viewInfo = {
    inicio: {
      label: "Inicio",
      title: "Todo en su lugar.",
      description:
        "Un espacio sencillo para explorar y organizar tus archivos."
    },
    archivos: {
      label: "Mis archivos",
      title: "Tus archivos.",
      description:
        "Explorá los archivos que seleccionaste en este dispositivo."
    },
    recientes: {
      label: "Recientes",
      title: "Lo último que elegiste.",
      description:
        "Tus archivos seleccionados más recientemente."
    },
    favoritos: {
      label: "Favoritos",
      title: "Tus favoritos.",
      description:
        "Marcá archivos como favoritos mientras esta página esté abierta."
    },
    papelera: {
      label: "Papelera",
      title: "Papelera local.",
      description:
        "Los archivos quitados de la lista se pueden recuperar durante esta sesión."
    },
    privacidad: {
      label: "Privacidad",
      title: "Tu privacidad importa.",
      description:
        "Información clara sobre lo que esta versión hace y no hace."
    }
  };

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (character) => {
      const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      };
      return entities[character];
    });
  }

  function formatSize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return "Tamaño desconocido";
    if (bytes === 0) return "0 bytes";

    const units = ["bytes", "KB", "MB", "GB", "TB"];
    const index = Math.min(
      Math.floor(Math.log(bytes) / Math.log(1024)),
      units.length - 1
    );

    const value = bytes / Math.pow(1024, index);
    return `${value.toLocaleString("es-AR", {
      maximumFractionDigits: index === 0 ? 0 : 2
    })} ${units[index]}`;
  }

  function classifyFile(file) {
    const type = file.type || "";
    const name = file.name.toLowerCase();

    if (type.startsWith("image.") || type.startsWith("image/")) {
      return "image";
    }

    if (
      type.startsWith("text/") ||
      type === "application/pdf" ||
      type.includes("wordprocessingml") ||
      type.includes("spreadsheetml") ||
      type.includes("presentationml") ||
      /\.(pdf|txt|md|rtf|doc|docx|odt|xls|xlsx|csv|ppt|pptx|ods|odp)$/.test(name)
    ) {
      return "document";
    }

    if (
      type.startsWith("video/") ||
      type.startsWith("audio/") ||
      /\.(mp4|mov|webm|mp3|wav|ogg|m4a)$/.test(name)
    ) {
      return "media";
    }

    return "other";
  }

  function iconForCategory(category) {
    const icons = {
      image: "▧",
      document: "▤",
      media: "♫",
      other: "◇"
    };

    return icons[category] || "◇";
  }

  function showToast(message) {
    if (!elements.toast) return;

    elements.toast.textContent = message;
    elements.toast.classList.add("visible");

    if (toastTimeout) {
      clearTimeout(toastTimeout);
    }

    toastTimeout = setTimeout(() => {
      elements.toast.classList.remove("visible");
    }, 3000);
  }

  function updateCount(count) {
    if (!elements.fileCount) return;

    elements.fileCount.textContent =
      `${count} ${count === 1 ? "archivo" : "archivos"}`;
  }

  function closeMenu() {
    elements.sidebar?.classList.remove("open");
    elements.menuButton?.setAttribute("aria-expanded", "false");
  }

  function openMenu() {
    elements.sidebar?.classList.add("open");
    elements.menuButton?.setAttribute("aria-expanded", "true");
  }

  function toggleMenu() {
    if (!elements.sidebar) return;

    const isOpen = elements.sidebar.classList.contains("open");
    isOpen ? closeMenu() : openMenu();
  }

  function matchesSearch(file, query) {
    const normalizedQuery = query.trim().toLocaleLowerCase("es");

    if (!normalizedQuery) return true;

    return file.name.toLocaleLowerCase("es").includes(normalizedQuery);
  }

  function getVisibleFiles() {
    const query = elements.searchInput?.value || "";

    return files.filter((file) => {
      if (file.trashed) return false;

      if (currentView === "papelera") return false;

      if (currentView === "favoritos" && !file.favorite) return false;

      if (currentView === "recientes" && !file.lastSelected) return false;

      if (
        activeFilter !== "all" &&
        file.category !== activeFilter
      ) {
        return false;
      }

      return matchesSearch(file, query);
    });
  }

  function createFileCard(file) {
    const card = document.createElement("article");
    card.className = "file-card";

    const preview = document.createElement("div");
    preview.className = "file-preview";

    if (file.category === "image" && file.objectURL) {
      const image = document.createElement("img");
      image.src = file.objectURL;
      image.alt = `Vista previa de ${file.name}`;
      image.loading = "lazy";
      preview.appendChild(image);
    } else {
      preview.textContent = iconForCategory(file.category);
      preview.setAttribute("aria-hidden", "true");
    }

    const name = document.createElement("span");
    name.className = "file-name";
    name.textContent = file.name;
    name.title = file.name;

    const meta = document.createElement("span");
    meta.className = "file-meta";
    meta.textContent = formatSize(file.size);

    const actions = document.createElement("div");
    actions.style.cssText =
      "display:flex;flex-wrap:wrap;gap:6px;margin-top:12px";

    const favoriteButton = document.createElement("button");
    favoriteButton.type = "button";
    favoriteButton.className = "text-button";
    favoriteButton.textContent = file.favorite ? "★ Favorito" : "☆ Favorito";
    favoriteButton.setAttribute(
      "aria-pressed",
      String(file.favorite)
    );
    favoriteButton.addEventListener("click", () => {
      file.favorite = !file.favorite;
      render();
      showToast(
        file.favorite
          ? "Añadido a favoritos."
          : "Quitado de favoritos."
      );
    });

    const actionButton = document.createElement("button");
    actionButton.type = "button";
    actionButton.className = "text-button";

    if (currentView === "papelera") {
      actionButton.textContent = "Restaurar";
      actionButton.addEventListener("click", () => {
        file.trashed = false;
        render();
        showToast("Archivo restaurado en esta sesión.");
      });
    } else {
      actionButton.textContent = "Quitar";
      actionButton.addEventListener("click", () => {
        file.trashed = true;
        render();
        showToast("Archivo quitado de la lista.");
      });
    }

    actions.append(favoriteButton, actionButton);
    card.append(preview, name, meta, actions);

    return card;
  }

  function renderPrivacyPage() {
    if (!elements.library) return;

    elements.library.innerHTML = `
      <div class="empty-state">
        <div class="empty-illustration" aria-hidden="true">♧</div>
        <h3>Privacidad en esta versión</h3>
        <p>
          Esta aplicación funciona como una demostración local.
          Los archivos elegidos se procesan en el navegador y no se
          envían a un servidor mediante este código.
        </p>
        <p>
          No hay cuentas reales, sincronización en la nube,
          almacenamiento remoto ni autenticación.
        </p>
        <p>
          No elijas archivos sensibles para probar una aplicación
          que todavía no cuenta con un backend revisado.
        </p>
      </div>
    `;
  }

  function render() {
    const info = viewInfo[currentView] || viewInfo.inicio;

    if (elements.currentSection) {
      elements.currentSection.textContent = info.label;
    }

    if (elements.pageTitle) {
      elements.pageTitle.textContent = info.title;
    }

    if (elements.pageDescription) {
      elements.pageDescription.textContent = info.description;
    }

    $$(".nav-link[data-view]").forEach((link) => {
      const active = link.dataset.view === currentView;
      link.classList.toggle("active", active);

      if (active) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });

    if (currentView === "privacidad") {
      if (elements.overview) elements.overview.hidden = true;
      if (elements.library) elements.library.hidden = false;

      if (elements.libraryTitle) {
        elements.libraryTitle.textContent = "Cómo funciona";
      }

      if (elements.libraryDescription) {
        elements.libraryDescription.textContent =
          "Estado real de las funciones disponibles.";
      }

      if (elements.emptyState) elements.emptyState.hidden = true;
      if (elements.fileGrid) elements.fileGrid.hidden = true;

      renderPrivacyPage();
      updateCount(0);
      return;
    }

    if (elements.overview) elements.overview.hidden = false;
    if (elements.library) elements.library.hidden = false;
    if (elements.fileGrid) {
      elements.fileGrid.hidden = false;
      elements.fileGrid.replaceChildren();
    }

    if (elements.libraryTitle) {
      elements.libraryTitle.textContent =
        currentView === "papelera"
          ? "Elementos quitados"
          : currentView === "favoritos"
            ? "Tus favoritos"
            : currentView === "recientes"
              ? "Seleccionados recientemente"
              : "Archivos seleccionados";
    }

    if (elements.libraryDescription) {
      elements.libraryDescription.textContent =
        currentView === "papelera"
          ? "Elementos quitados durante esta sesión."
          : "Los archivos de esta lista no están guardados en la nube.";
    }

    const visibleFiles = currentView === "papelera"
      ? files.filter((file) => file.trashed &&
          matchesSearch(file, elements.searchInput?.value || ""))
      : getVisibleFiles();

    updateCount(visibleFiles.length);

    if (elements.emptyState) {
      elements.emptyState.hidden = visibleFiles.length > 0;
    }

    if (elements.fileGrid) {
      visibleFiles.forEach((file) => {
        elements.fileGrid.appendChild(createFileCard(file));
      });
    }

    if (elements.emptyState && visibleFiles.length === 0) {
      const heading = elements.emptyState.querySelector("h3");
      const paragraph = elements.emptyState.querySelector("p");
      const small = elements.emptyState.querySelector("small");

      if (heading) {
        heading.textContent =
          currentView === "papelera"
            ? "La papelera está vacía"
            : currentView === "favoritos"
              ? "Todavía no hay favoritos"
              : elements.searchInput?.value
                ? "No encontramos resultados"
                : "Tu espacio está listo";
      }

      if (paragraph) {
        paragraph.textContent =
          currentView === "papelera"
            ? "Los archivos que quites aparecerán aquí durante esta sesión."
            : currentView === "favoritos"
              ? "Marcá un archivo como favorito para encontrarlo aquí."
              : elements.searchInput?.value
                ? "Probá con otro nombre o limpiá la búsqueda."
                : "Seleccioná archivos desde tu dispositivo para verlos en esta página.";
      }

      if (small) {
        small.textContent = "No se realiza ninguna subida a Internet.";
      }
    }
  }

  function addFiles(fileList) {
    const selectedFiles = Array.from(fileList || []);

    if (selectedFiles.length === 0) return;

    let added = 0;

    for (const file of selectedFiles) {
      // Evitar duplicados idénticos en la lista de esta sesión.
      const duplicate = files.some(
        (existing) =>
          existing.name === file.name &&
          existing.size === file.size &&
          existing.lastModified === file.lastModified
      );

      if (duplicate) continue;

      files.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
        category: classifyFile(file),
        favorite: false,
        trashed: false,
        lastSelected: true,
        objectURL: file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : null,
        originalFile: file
      });

      added++;
    }

    // Restablecer para permitir seleccionar el mismo archivo otra vez.
    if (elements.fileInput) elements.fileInput.value = "";

    render();

    showToast(
      added > 0
        ? `${added} ${added === 1 ? "archivo añadido" : "archivos añadidos"} a la lista local.`
        : "Esos archivos ya están en la lista."
    );
  }

  function navigate(view) {
    if (!viewInfo[view]) return;

    currentView = view;
    activeFilter = "all";

    if (elements.searchInput) {
      elements.searchInput.value = "";
    }

    closeMenu();
    render();

    if (location.hash !== `#${view}`) {
      history.replaceState(null, "", `#${view}`);
    }
  }

  function applyCategoryFilter(category) {
    activeFilter = category;
    currentView = "archivos";
    closeMenu();
    render();

    if (elements.library) {
      elements.library.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start"
      });
    }
  }

  function clearSearch() {
    if (elements.searchInput) {
      elements.searchInput.value = "";
    }

    activeFilter = "all";
    render();
    elements.searchInput?.focus();
  }

  function cleanup() {
    files.forEach((file) => {
      if (file.objectURL) URL.revokeObjectURL(file.objectURL);
    });
  }

  function bindEvents() {
    elements.menuButton?.addEventListener("click", toggleMenu);

    elements.fileInput?.addEventListener("change", (event) => {
      addFiles(event.target.files);
    });

    elements.searchInput?.addEventListener("input", render);
    elements.clearSearch?.addEventListener("click", clearSearch);

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
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        elements.searchInput?.focus();
      }

      if (event.key === "Escape") {
        closeMenu();
      }
    });

    document.addEventListener("click", (event) => {
      if (
        window.innerWidth <= 760 &&
        elements.sidebar?.classList.contains("open") &&
        !elements.sidebar.contains(event.target) &&
        !elements.menuButton?.contains(event.target)
      ) {
        closeMenu();
      }
    });

    window.addEventListener("hashchange", () => {
      const requestedView = location.hash.slice(1);
      if (viewInfo[requestedView] && requestedView !== currentView) {
        navigate(requestedView);
      }
    });

    window.addEventListener("beforeunload", cleanup);
  }

  function init() {
    bindEvents();

    const initialView = location.hash.slice(1);
    if (viewInfo[initialView]) {
      currentView = initialView;
    }

    render();
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", BacusArchive.init);
