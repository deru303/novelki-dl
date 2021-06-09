// ==UserScript==
// @name         novelki-dl
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Pobieranie novelek ze strony novelki.pl
// @author       Daniel "Deru" Rogowski
// @match        https://novelki.pl/*
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @require      https://cdn.jsdelivr.net/npm/js-base64@3.6.0/base64.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.0/FileSaver.min.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// ==/UserScript==

// Obiekt danych przenoszony pomiędzy poszczególnymi uruchomieniami skryptu
let dl_data = {

    // Kod aktualnie pobieranej nowelki (na przykład "absolute-choice") lub null, jeśli żadna nowelka nie jest obecnie pobierana
    "downloading": null,

    // Indeks aktualnie pobieranego rozdziału nowelki lub null, jeśli żadna nowelka nie jest obecnie pobierana
    "downloading_chapter_index": null,

    // Tablica obiektów z danymi na temat nowelek
    "novels": [
        {
            "code_name": "absolute-choice",
            "fully_fetched": false,
            "name": "Absolute Choice",
            "author": "Pear Lands In The Autumn Spring",
            "cover_img": "https://novelki.pl/uploads/2f864fcf5ce4d3aaea69205d4bb9834f.jpg",
            "chapters": [
                "https://novelki.pl/projekty/absolute-choice/5c9506f0ee1faccc1b2d54a8ecf93b85",
                "https://novelki.pl/projekty/absolute-choice/bf2080bf78c7025ff336b495487729b9"
            ],
            "fetched_chapters": [
                ["Tom 1 rozdział 1", "<h1>Treść html</h1>"],
                ["Tom 1 rozdział 2", "<h1>Treść html</h1>"]
            ]
        }
    ]

}

// Zapisuje dane nowelki o wskazanym kodzie do pliku o rozszerzeniu json
function saveNovelToFile(novel_code) {
    let novel = dl_data.novels.filter(novel => novel.code_name == novel_code)[0];
    let json = JSON.stringify(novel, null, 4);
    let blob = new Blob([json], {type: "text/plain;charset=utf-8"});
    saveAs(blob, `${novel.code_name}.nov.json`);
}

// Wczytuje obiekt dl_data zapisany w danych przeglądarki
function retrieveDlData() {
    let data = GM_getValue("novelki_dl_data");
    if (typeof data !== 'undefined') {
        dl_data = JSON.parse(data);
    }
}

// Zapisuje obiekt dl_data w danych przeglądarki (tak aby możliwe było jego odczytanie po odświeżeniu strony)
function writeDlData() {
    let json = JSON.stringify(dl_data);
    GM_setValue("novelki_dl_data", json);
}

// Przetwarza adres URL postaci "https://novelki.pl/projekty/absolute-choice/" do postaci tablicy ["novelki.pl", "projekty", "absolute-choice"]
function getSplittedUrl(urlToSplit=window.location.href) {
    let url_regex = /^(https|http):\/\/(.+)\/*$/;
    let url = window.location.href.match(url_regex)[2];
    var url_ex = url.split("/");
    return url_ex;
}

// Zwraca typ obecnej podstrony ("novel_page", "novel_reader_page") lub "unrecognized", jeżeli użytkownik nie jest na
// żadnej podstronie rozpoznawanej przez skrypt.
function getCurrentSubpageType() {
    let url_ex = getSplittedUrl();

    if (url_ex[1] == "projekty" && url_ex.length == 3) {
        // Strona nowelki, na przykład https://novelki.pl/projekty/absolute-choice
        return "novel_page";
    }
    else if (url_ex[1] == "projekty" && url_ex.length == 4) {
        // Strona czytania rozdziału nowelki, na przykład https://novelki.pl/projekty/absolute-choice/5c9506f0ee1faccc1b2d54a8ecf93b85
        return "novel_read_page";
    }
    else {
        return "unrecognized";
    }
}

// Jeżeli użytkownik aktualnie jest na podstronie nowelki, funkcja zapisuje dane na temat wyświetlonej nowelki do zmiennej dl_data
function scrapeNovelMetadata() {
    if (getCurrentSubpageType() != "novel_page") {
        return;
    }

    let novel_data = {};
    novel_data.code_name = getSplittedUrl()[2];
    novel_data.name = $("main#app h3").html();
    novel_data.cover_img = $("main#app img").prop("src");
    novel_data.author = $('p.h5 span').eq(1).html();
    novel_data.chapters = [];
    novel_data.fetched_chapters = []

    $(".col-6.col-sm-4.col-md-3.col-lg-2 a").each(function(el_index, el) {novel_data.chapters.push(el["href"])});
    novel_data.chapters.reverse();

    dl_data.novels = dl_data.novels.filter(novel => novel.code_name != novel_data.code_name);
    dl_data.novels.push(novel_data);
    return novel_data;
}

// Funcja wywoływana na podstronie nowelki
function handleNovelPage() {
    var btnPlace = $("main#app div").first();
    var btnCode = "<button id='fetch-novel' class='btn btn-sm btn-success' style='margin-bottom: 15px;'>[1] Przeanalizuj tę nowelkę</button>";
    btnPlace.html(btnPlace.html() + btnCode);

    $("#fetch-novel").on("click", function() {
        let currentNovel = scrapeNovelMetadata();
        dl_data.downloading = currentNovel.code_name;
        dl_data.downloading_chapter_index = 0;
        writeDlData();

        window.location.href = currentNovel.chapters[0];
    });

    let current_novel = dl_data.novels.filter(novel => novel.code_name == getSplittedUrl()[2]);
    if(current_novel.length > 0) {
        current_novel = current_novel[0];

        let btnCode = "<button id='download-novel' class='btn btn-sm btn-info' style='margin-bottom: 15px;'>[2] Pobierz tę nowelkę</button>";
        let btnPlace = $("main#app div").first();
        btnPlace.html(btnPlace.html() + btnCode);

        $("#download-novel").on("click", function() {
            saveNovelToFile(getSplittedUrl()[2]);
        });
    }
}

// Funkcja wywoływana na podstronie czytania nowelki
function handleNovelReadPage() {
    // Jeżeli aktualnie nie pobieramy żadnej nowelki, to funkcja nie podejmuje żadnego działania
    if (dl_data.downloading == null || dl_data.downloading_chapter_index == null) {
        return;
    }

    let chapterTitle = "";
    let chapterContent = "";

    // Treść nowelki jest ładowana dynamicznie przez AJAX, więc aby odczytać tytuł i treść wymagany jest timer wykonujący się tak długo, aż nowelka się wczyta
    let timer = setInterval(function() {
        chapterContent = $("#content .reader-content div").html();
        if (chapterContent.length > 0) {
            chapterTitle = $("#content .reader-content p").first().html().trim();

            clearInterval(timer);

            let novel = dl_data.novels.filter(novel => novel.code_name == dl_data.downloading)[0];
            novel.fetched_chapters.push([chapterTitle, chapterContent]);

            if (dl_data.downloading_chapter_index == novel.chapters.length - 1) {
                // Właśnie pobrano ostatni rozdział nowelki
                dl_data.downloading_chapter_index = null;
                dl_data.downloading = null;
                dl_data.fully_fetched = true;
                writeDlData();
                window.location.href = `https://novelki.pl/projekty/${novel.code_name}`;
            }
            else {
                // Są jeszcze inne rozdziały do pobrania
                dl_data.downloading_chapter_index++;
                window.location.href = novel.chapters[dl_data.downloading_chapter_index];
                writeDlData();
            }
        }
    }, 350);
}

// Funkcja uruchamiana przy każdym uruchomieniu skryptu
(function() {
    'use strict';
    retrieveDlData();

    let currentPageType = getCurrentSubpageType();

    if (currentPageType == "novel_page") {
        handleNovelPage();
    }
    else if (currentPageType == "novel_read_page") {
        handleNovelReadPage();
    }

    writeDlData();
    console.log(dl_data);
})();