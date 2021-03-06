/* global console */
(function(){
	"use strict";

	function getDomainRegExpList(domainList){
		var list = domainList
			.split(",")
			.map(function(entry){
				return entry.replace(/^\s+|\s+$/g, "");
			})
			.filter(function(entry){
				return !!entry.length;
			})
			.map(function(entry){
				var regExp;
				var domain = !!entry.match(/^[\w.]+$/);
				if (domain){
					regExp = new RegExp("(?:^|\\.)" + entry.replace(/([\\\+\*\?\[\^\]\$\(\)\{\}\=\!\|\.])/g, "\\$1") + "\\.?$", "i");
				}
				else {
					regExp = new RegExp(entry, "i");
				}
				return {
					match: function(url){
						if (domain){
							return url.hostname.match(regExp);
						}
						else {
							return url.href.match(regExp);
						}
					}
				};
			});
			
			list.match = function(url){
				return this.some(function(entry){
					return entry.match(url);
				});
			};
			
			return list;
	}

	var self = require("sdk/self");
	var pageMod = require("sdk/page-mod");
	var array = require("sdk/util/array");
	var preferences = require("sdk/simple-prefs");
	var prefs = preferences.prefs;
	var URL = require("sdk/url").URL;
	var _ = require("sdk/l10n").get;

	// preferences
	Object.keys(prefs).forEach(function(pref){
		preferences.on(pref, function(){
			workers.forEach(checkWorker);
		});
	});
	var whiteList;
	function updateWhiteList(){
		whiteList = getDomainRegExpList(prefs.whiteList);
	}
	updateWhiteList();
	preferences.on("whiteList", function(){
		updateWhiteList();
	});

	var blackList;
	function updateBlackList(){
		blackList = getDomainRegExpList(prefs.blackList);
	}
	updateBlackList();
	preferences.on("blackList", function(){
		updateBlackList();
	});
	
	function checkURL(url){
		var url = new URL(url);
		var mode = "block";
		switch (prefs.blockMode){
			case "blockEverything":
				mode = "block";
				break;
			case "allowOnlyWhiteList":
				if (whiteList.match(url)){
					mode = "unblock";
				}
				else {
					mode = "block";
				}
				break;
			case "ask":
			case "blockReadout":
			case "fakeReadout":
			case "askReadout":
				if (whiteList.match(url)){
					mode = "unblock";
				}
				else if (blackList.match(url)){
					mode = "block";
				}
				else {
					mode = prefs.blockMode;
				}
				break;
			case "blockOnlyBlackList":
				if (blackList.match(url)){
					mode = "block";
				}
				else {
					mode = "unblock";
				}
				break;
			case "allowEverything":
				mode = "unblock";
				break;
			default:
				console.log("Unknown blocking mode. Default to block everything.");
		}
		return mode;
	}
	function checkWorker(worker){
		try {
			var mode = checkURL(worker.url);
			worker.port.emit(mode, false, prefs.askOnlyOnce);
		}
		catch (e){
			console.log("Error updating " + worker.url + ": " + e.message);
		}
	}

	var workers = [];
	pageMod.PageMod({
		include: "*",
		contentScriptWhen: "start",
		contentScriptFile: self.data.url("inject.js"),
		onAttach: function(worker){
			
			array.add(workers, worker);
			worker.on("pageshow", function(){
				array.add(workers, this);
			});
			worker.on("pagehide", function(){
				array.remove(workers, this);
			});
			worker.on("detach", function(){
				array.remove(workers, this);
			});
			worker.port.on("isPDF", function(blocking){
				if (prefs.allowPDFCanvas){
					this.emit("unblock");
				}
				else {
					this.emit(blocking, true, prefs.askOnlyOnce);
				}
			});
			worker.port.emit("setTranslation", "askForPermission", _("askForPermission"));
			worker.port.emit("setTranslation", "askForReadoutPermission", _("askForReadoutPermission"));
			checkWorker(worker);
		},
	});

}());