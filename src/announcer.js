"use strict";

import Queue from './queue.js';
import AnnouncementManager from './announcement.js';
import logger from './logger.js';

class Announcer {
    constructor(guild, style, ignoreEmpty, voiceId, langCode, enterAlert, exitAlert, userVoices, userAlerts, blacklist, whitelist) 
    {
        logger.debug(`blacklist: ${blacklist} | whitelist: ${whitelist}`);
        this.announcementManager = new AnnouncementManager(voiceId, userVoices, userAlerts, langCode, enterAlert, exitAlert);
        this.announceQueue = new Queue();
        this.announcing = false;
        this.guild = guild;
        this.style = style;
        this.ignoreEmpty = ignoreEmpty;
        this.blacklist = blacklist;
        this.whitelist = whitelist;
    }
    
    updateVoiceId(voiceId, languageCode) {
        this.announcementManager.updateVoiceId(voiceId, languageCode);
    }
 
    updateUserVoiceId(userId, voiceId, langCode) {
        this.announcementManager.updateUserVoiceId(userId, voiceId, langCode);
    }
    
    updateUserVoices(userVoices) {
        this.announcementManager.updateUserVoices(userVoices);
    }

    updateUserAlerts(alerts) {
        this.announcementManager.updateUserAlerts(alerts);
    }

    updateUserEnterAlert(userId, format) {
        this.announcementManager.updateUserEnterAlert(userId, format);
    }

    updateUserExitAlert(userId, format) {
        this.announcementManager.updateUserExitAlert(userId, format);
    }   
    updateEnterAlert(format) {
        this.announcementManager.updateEnterAlert(format);
    }
    
    updateExitAlert(format) {
        this.announcementManager.updateExitAlert(format);
    }
    
    updateAnnouncementStyle(style) {
        if (!style) return;
        
        this.style = style.toLowerCase();
    }
    
    updateIgnoreEmpty(isEnabled) {
        if(isEnabled === null || isEnabled === undefined) return;
        
        this.ignoreEmpty = isEnabled;
    }
    
    updateBlacklist(blacklist) {
        this.blacklist = blacklist;
    }
    
    updateWhitelist(whitelist) {
        this.whitelist = whitelist;
    }
    
    handleVoiceUpdate(username, userid, oldChannel, newChannel, voiceConnection) {
        if (oldChannel && oldChannel.id === this.guild.afkChannelID) {
            oldChannel = null;
        } else if (newChannel && newChannel.id === this.guild.afkChannelID) {
            newChannel = null;
        }
        
        if (oldChannel) {
            oldChannel.memberCount = this.getChannelMemberCount(oldChannel, userid);
        }
        
        if (newChannel) {
            newChannel.memberCount = this.getChannelMemberCount(newChannel, userid);
        }
        
        logger.debug('********* new update ************');
        
        if (oldChannel && newChannel) {
            if(oldChannel.id !== newChannel.id) {            
                const currentBotChannel = voiceConnection ? voiceConnection.channel : null;
                
                if (currentBotChannel && currentBotChannel.id === oldChannel.id) {
                    logger.debug('exit first');
                    this.queueExitFirstAsync(username, userid, newChannel, oldChannel);
                } else {
                    logger.debug('any or enter first');
                    this.queueJoinFirstAsync(username, userid, newChannel, oldChannel);
                }
                
            }
        } else if (oldChannel) {
            this.queueExitAsync(username, userid, oldChannel, true);
        } else if (newChannel) {
            this.queueJoinAsync(username, userid, newChannel, true);
        }
    }
    
    async queueJoinFirstAsync(username, userId, newChannel, oldChannel) {
        await this.queueJoinAsync(username, userId, newChannel, false);        
        await this.queueExitAsync(username, userId, oldChannel, false);
        
        this.startAnnouncing();
    }
    
    async queueExitFirstAsync(username, userId, newChannel, oldChannel) {
        await this.queueExitAsync(username, userId, oldChannel, false);
        await this.queueJoinAsync(username, userId, newChannel, false);
        
        this.startAnnouncing();
    }
    
    async queueJoinAsync(username, userId, channel, startAnnouncing) {
        if (this.shouldAnnounceTheJoin(channel.memberCount)) {
            if (this.isChannelWhitelisted(channel.id) || !(this.anyChannelWhitelisted() || this.isChannelBlacklisted(channel.id))) { 
                logger.debug('announce join');
                await this.createAndQueueAnnouncement(username, userId, channel, true);
            } else {
                logger.debug('Channel is blacklisted or not on whitelist - ignoring join');
            }
        } else {
            logger.debug('skipping init join announce');
        }
        
        if (startAnnouncing) {
            this.startAnnouncing();
        }
    }
    
    async queueExitAsync(username, userId, channel, startAnnouncing) {
        if (this.shouldAnnounceTheExit(channel.memberCount)) {
            if (this.isChannelWhitelisted(channel.id) || !(this.anyChannelWhitelisted() || this.isChannelBlacklisted(channel.id))) { 
                logger.debug('exit announce');
                await this.createAndQueueAnnouncement(username, userId, channel, false);
            } else {
                logger.debug('Channel is blacklisted or not on whitelist - ignoring exit');
            }
        } else {
            logger.debug('skipping exit announce');
        }
        
        if (startAnnouncing) {
            this.startAnnouncing();
        }
    }
    
    async createAndQueueAnnouncement(username, userId, channel, entered) {        
        logger.debug('announcing and starting promise');
        const ann = await this.announcementManager.createAnnouncement(username, userId, channel, entered);
        this.queueAnnouncement(ann);
    }
    
    startAnnouncing() {
        if (!this.announcing) {
            this.annouceNextUser();
        }
    }
    
    annouceNextUser() {
        this.announcing = true;
        
        logger.debug('annoucement queue: ' + this.announceQueue.size());
        const announcement = this.announceQueue.dequeue();
        
        if (announcement) {
            logger.debug('got next announcement... annoucing...');
            this.announce(announcement);
        } else {
            logger.debug('no more annoucements');
            this.announcing = false;
        }
    }
    
    announce(announcement) {
        if (announcement && announcement.channel && announcement.stream) {
            logger.debug('joining and announcing...');
            announcement.channel.join().then(this.onChannelJoined.bind(this, announcement));
        } else {
            logger.debug('something was null in the announcement - skipping', announcement);
            this.annouceNextUser();
        }
    }
    
    onChannelJoined(announcement, connection) {
        logger.debug('dipatching play...');
        const dispatcher = connection.play(announcement.stream);                
        dispatcher.on('speaking', (isSpeaking) => { 
            if (!isSpeaking) {
                this.annouceNextUser();
            }
        });
    }
    
    queueAnnouncement(ann) {
        logger.debug('announcement queued');
        this.announceQueue.enqueue(ann);
    }
    
    getChannelMemberCount(channel, idToIgnore) {
        let size = 0;
        channel.members.forEach((v, k, m) => {
            if (!v.user.bot && v.user.id !== idToIgnore) 
                size++;
        });
        
        return size;
    }
    
    shouldAnnounceJoins() {
        return this.style === 'both' || this.style === 'join';
    }
    
    shouldAnnounceExits() {
        return this.style === 'both' || this.style === 'exit';
    }
    
    anyChannelWhitelisted() {
        logger.debug(`is any channel whitelisted: ${this.whitelist.length > 0}`)
        return this.whitelist.length > 0;
    }
    
    isChannelWhitelisted(channelId) {
        const isWhitelisted = this.whitelist.find(id => id === channelId) !== undefined;
        logger.debug(`is channel ${channelId} whitelisted: ${isWhitelisted}`);
        return isWhitelisted;
    }
    
    isChannelBlacklisted(channelId) {
        const isBlacklisted = this.blacklist.find(id => id === channelId) !== undefined;
        logger.debug(`is channel ${channelId} blacklisted: ${isBlacklisted}`);
        return isBlacklisted;
    }
    
    shouldAnnounceTheJoin(memberCount) {
        logger.debug('join: ' + memberCount);
        logger.debug(`ignore empty? ${this.ignoreEmpty}`);
        logger.debug(`should announce joins: ${this.shouldAnnounceJoins()} - ${this.style}`);
        logger.debug(`checking ignore: ${(!this.ignoreEmpty || (this.ignoreEmpty && memberCount > 0))}`);
        return this.shouldAnnounceJoins() && (!this.ignoreEmpty || (this.ignoreEmpty && memberCount > 0));
    }
    
    shouldAnnounceTheExit(memberCount) {
        logger.debug('exit: ' + memberCount);
        logger.debug(`ignore empty? ${this.ignoreEmpty}`);
        logger.debug(`should announce exits: ${this.shouldAnnounceExits()}`);
        logger.debug(`checking ignore: ${(!this.ignoreEmpty || (this.ignoreEmpty && memberCount > 0))}`);
        return this.shouldAnnounceExits() && (!this.ignoreEmpty || (this.ignoreEmpty && memberCount > 0));
    }
}

export default Announcer;
