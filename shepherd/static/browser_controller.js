var CBrowser = function(reqid, target_div, init_params) {
    var cmd_host = undefined;
    var vnc_host = undefined;

    var connected = false;
    var ever_connected = false;

    var fail_count = 0;

    var min_width = 800;
    var min_height = 600;

    var RFB;
    var rfb;
    var resizeTimeout;
    var vnc_pass = "secret";

    var end_time = undefined;
    var cid = undefined;

    var waiting_for_container = false;
    var waiting_for_vnc = false;

    init_params = init_params || {};

    init_params.api_prefix = init_params.api_prefix || "";

    var num_vnc_retries = init_params.num_vnc_retries || 3;

    var req_params = {};


    function start() {
        if (!window.INCLUDE_URI) {
            if (!init_params.static_prefix) {
                init_params.static_prefix = "/static/";
            }


            window.INCLUDE_URI = init_params.static_prefix + "novnc/";
            console.log("~~~~ before loading ~~~~");
            $.getScript("https://cdnjs.cloudflare.com/ajax/libs/require.js/2.3.6/require.min.js", function(){
                console.log("requireJS loaded");
                requirejs([window.INCLUDE_URI + "rfb.js"], function(rfb){
                    RFB = rfb.default;

                    // Countdown updater
                    if (init_params.on_countdown) {
                        setInterval(update_countdown, 1000);
                    }

                    init_html(target_div);

                    setup_browser();

                    init_clipboard();
                });

            });
        }
    }


    function canSupportWebRTC() {
        var isWebRTCSupported = window.RTCPeerConnection;
        return isWebRTCSupported;
    }

    function canSupportMediaSource() {
        return typeof(mediaSource) != undefined;
    }


    function init_clipboard() {
        if (!init_params.clipboard) {
            return;
        }

        var lastText = undefined;

        $(init_params.clipboard).on('change keyup paste', function() {
            var text = $(init_params.clipboard).val();

            if (connected && rfb && lastText != text) {
                rfb.clipboardPasteFrom(text);
                lastText = text;
            }
        });
    }

    function canvas() {
        return $("div.screen", target_div);
    }

    function msgdiv() {
        return $("#browserMsg", target_div);
    }

    // function screen() {
    //     return $("#noVNC_screen", target_div);
    // }

    function init_html() {
        $(target_div).css('height', '100%');
        $(target_div).append($("<div>", {"id": "browserMsg", "class": "loading"}).text(""));
        $(target_div).append($("<div>", {"id": "noVNC_screen", "style": "position: absolute; height:" + "100%; width:100%"}).append($("<div class=\"screen\"/>")));


        canvas().css('height','100%');

        //canvas().hide();

        /*
        screen().blur(lose_focus);
        screen().mouseleave(lose_focus);

        screen().mouseenter(grab_focus);

        canvas().on('click', grab_focus);
        */
    }

    function setup_browser() {
        if (waiting_for_vnc || waiting_for_container) {
            return;
        }

        var msg;

        if (ever_connected) {
            msg = "Reconnecting to Remote Browser...";
        } else {
            msg = "Initializing Remote Browser...";
        }

        msgdiv().html(msg);
        msgdiv().show();

        // calculate dimensions
        var hh = $('header').height();
        var w, h;
        if (!init_params.fill_window) {
            w = window.innerWidth * 0.96;
            h = window.innerHeight - (25 + hh);
        } else {
            w = window.innerWidth;
            h = window.innerHeight;
        }

        if (w < h) {
            // flip mins for vertical layout
            var t = min_width;
            min_width = min_height;
            min_height = t;
        }

        req_params['width'] = Math.max(w, min_width);
        req_params['height'] = Math.max(h, min_height);
        req_params['width'] = parseInt(req_params['width'] / 8) * 8;
        req_params['height'] = parseInt(req_params['height'] / 8) * 8;

        req_params['reqid'] = reqid;

        // check webrtc compatibility
        if (canSupportWebRTC()) {
           req_params["sound"] = "webrtc"
        } else if (canSupportMediaSource()) {
            req_params["sound"] = "opus"
        }
        init_browser();
    }

    function init_browser() {
        if (waiting_for_container) {
            return;
        }

        waiting_for_container = true;

        var init_url = init_params.api_prefix + "/init_browser?" + $.param(req_params);

        $.getJSON(init_url)
        .done(handle_browser_response)
        .fail(function(jqxhr) {
            if (!jqxhr || jqxhr.status != 404) {
                msgdiv().text("Reconnecting to Remote Browser...");
                msgdiv().show();
                setTimeout(init_browser, 1000);
                return;
            }

            if (init_params.on_event) {
                init_params.on_event("expire");
            } else {
                msgdiv().text("Remote Browser Expired... Please try again...");
                msgdiv().show();
            }
        }).always(function() {
            waiting_for_container = false;
        });
    }

    function handle_browser_response(data) {
        qid = data.id;

        if (data.cmd_host && data.vnc_host) {
            cmd_host = data.cmd_host;
            vnc_host = data.vnc_host;

            end_time = parseInt(Date.now() / 1000) + data.ttl;

            vnc_pass = data.vnc_pass;

            if (init_params.audio) {
                // setup_browser can be called many times (specially when noVnc thrown an exception), we deinitialize sound before reinit
                if (window.hasOwnProperty("audioPlugin")) {
                    try {
                        window.audioPlugin.stop();
                        window.audioPlugin = undefined;
                    } catch (err){}

                }
                if (data.audio == "opus") {
                    $.loadScript('audio_opus.js', function(){
                        window.audioPlugin = AudioOpus(data, init_params)
                    })
                }
                if (data.audio == "webrtc") {
                    $.loadScript('audio_webrtc.js', function(){
                        $.loadScript('https://webrtc.github.io/adapter/adapter-latest.js', function(){
                            if (!window.hasOwnProperty("audioPlugin")) {
                                window.audioPlugin = AudioWebRTC(reqid, data);
                            }
                        })
                    })
                }
            }

            if (init_params.on_event) {
                init_params.on_event("init", data);
            }

            window.setTimeout(try_init_vnc, 1000);

        } else if (data.queue != undefined) {
            var msg = "Waiting for empty slot... ";
            if (data.queue == 0) {
                msg += "<b>You are next!</b>";
            } else {
                msg += "At most <b>" + data.queue + " user(s)</b> ahead of you";
            }
            msgdiv().html(msg);

            window.setTimeout(init_browser, 3000);
        }
    }

    function try_init_vnc() {
        do_vnc()
            .fail(function() {
                fail_count++;

                if (fail_count <= num_vnc_retries) {
                    msgdiv().text("Retrying to connect to remote browser...");
                    setTimeout(init_browser, 500);
                } else {
                    if (init_params.on_event) {
                        init_params.on_event("fail");
                    } else {
                        msgdiv().text("Failed to connect to remote browser... Please try again later");
                    }
                }
            });

    }

    function lose_focus() {
        if (!rfb) return;
        rfb._keyboard.ungrab();
        rfb._mouse.ungrab();
    }

    function grab_focus() {
        if (!rfb) return;

        if (document.activeElement &&
            (document.activeElement.tagName == "INPUT" || document.activeElement.tagName == "TEXTAREA")) {
            lose_focus();
            return;
        }

        if (init_params.fill_window) {
            canvas().focus();
        }

        rfb._keyboard.grab();
        rfb._mouse.grab();
    }

    function clientPosition() {
        var hh = $('header').height();
        var container = canvas();
        var inner_canvas = container.find("canvas");

        var ch = inner_canvas.height();
        var cw = inner_canvas.width();
        if (!init_params.fill_window) {
            var marginLeft =  (window.innerWidth - cw)/2;
            var marginTop = (window.innerHeight - (hh + ch + 25))/2;
            console.log("new MarginLeft " + marginLeft + ", marginTop = "+ marginTop);
            container.css({
                marginLeft: marginLeft,
                marginTop: marginTop
            });
        }
    }

    function clientResize() {
        var hh = $('header').height();
        var w, h;

        if (init_params.fill_window) {
            w = window.innerWidth;
            h = window.innerHeight;
        } else {
            w = Math.round(window.innerWidth * 0.96);
            h = Math.round(window.innerHeight - (25 + hh));
        }

        if (rfb) {
            console.log("Resizing to " + w + "x" + h);
            var s = rfb._display.autoscale(w, h);
            //rfb._mouse().set_scale(s);
        }
    }

    function onVNCCopyCut(rfb, text)
    {
        if (init_params.clipboard) {
            $(init_params.clipboard).val(text);
        }
    }




    function do_vnc() {

        if (waiting_for_vnc) {
            return;
        }

        waiting_for_vnc = true;

        var hostport = vnc_host.split(":");
        var host = hostport[0];
        var port = hostport[1];

        var path = "websockify";
        var protocol = "ws";

        if (window.location.protocol === "https:") {
            protocol = "wss";
        }

        // Proxy WS via the origin host, instead of making direct conn
        // 'proxy_ws' specifies the proxy path, port is appended
        if (init_params.proxy_ws) {
            path = init_params.proxy_ws + port;
            host = window.location.hostname;

            port = window.location.port;
            if (!port) {
                port = (window.location.protocol == "https:" ? 443 : 80);
            }
        }

        var deferred = $.Deferred();

        function updateDeferred(state) {
            if (deferred.state() == "pending") {
                waiting_for_vnc = false;
                if (state == "connected") {
                    deferred.resolve(state);
                } else {
                    deferred.reject(state);
                }
            }
        }

        var target = canvas()[0];
        var webservice_url = protocol + '://' + host + ':' + port + '/' + path;

        console.log("Connecting to " + webservice_url);

        rfb = new RFB(target, webservice_url, {'credentials': {'password': vnc_pass}});

        rfb.addEventListener("credentialsrequired", function () {
            updateDeferred("credentialsrequired");
        });
        rfb.addEventListener("connect", function () {
            canvas().show();
            if (init_params.fill_window) {
                canvas().focus();
            }

            msgdiv().hide();

            ever_connected = true;
            connected = true;
            fail_count = 0;

            if (init_params.on_event) {
                init_params.on_event("connect");
            }
            rfb.resizeSession = true;
            rfb.scaleViewport = true;


            canvas().find('div').css('background-color', '');

            updateDeferred("connected");
        });
        rfb.addEventListener("disconnect", function () {
            connected = false;

            canvas().hide();

            var reinit = !document.hidden;

            if (init_params.on_event) {
                init_params.on_event("disconnect");
            }

            if (reinit) {
                setup_browser();
            }
            updateDeferred("disconnected");
        });
        rfb.addEventListener("securityfailure", function () {
            updateDeferred("securityFailure");
        });
        rfb.addEventListener("clipboard", function (event) {
            onVNCCopyCut(rfb, event.text)
        });

        return deferred;

    }

    window.onresize = function () {
        // When the window has been resized, wait until the size remains
        // the same for 0.5 seconds before sending the request for changing
        // the resolution of the session
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(function(){
            clientResize();
            clientPosition();
        }, 500);
    };

    function update_countdown() {
        if (!end_time) {
            return;
        }
        var curr = Math.floor(new Date().getTime() / 1000);
        var secdiff = end_time - curr;

        if (secdiff < 0) {
            init_params.on_countdown(0, "00:00");
            return;
        }

        var min = Math.floor(secdiff / 60);
        var sec = secdiff % 60;
        if (sec <= 9) {
            sec = "0" + sec;
        }
        if (min <= 9) {
            min = "0" + min;
        }

        init_params.on_countdown(secdiff, min + ":" + sec);
    }

    if (init_params.inactiveSecs) {
        var did;

        document.addEventListener("visibilitychange", function() {
            if (document.hidden) {
                did = setTimeout(function() {
                    if (rfb) {
                        rfb.disconnect();
                    }
                },
                init_params.inactiveSecs * 1000);
            } else {
                clearTimeout(did);
                if (!connected) {
                    if (init_params.on_event) {
                        init_params.on_event("reconnect");
                    }

                    setup_browser();
                }
            }
        });
    }
    start();

    return {"grab_focus": grab_focus,
            "lose_focus": lose_focus}
};

jQuery.loadScript = function (file, callback) {
    // Relative to this JS file
    if (file.substr(0,4) != "http") {
        var jsFileLocation = $('script[src*=browser_controller]').attr('src');  // the js file path
        file = jsFileLocation.replace('browser_controller.js', file);
    }

    jQuery.ajax({
        url: file,
        dataType: 'script',
        success: callback,
        async: true
    });
}




