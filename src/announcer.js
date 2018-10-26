"use strict";

import Queue from './queue.js';
import Announcement from './announcement.js';

class Announcer {
    constructor(guild, style, ignoreEmpty) 
    {
        this.announceQueue = new Queue();
        this.announcing = false;
        this.guild = guild;
        this.style = style;
        this.ignoreEmpty = ignoreEmpty;
    }
    
    updateAnnouncementStyle(style) {
        if (!style) return;
        
        this.style = style.toLowerCase();
    }
    
    updateIgnoreEmpty(isEnabled) {
        if(isEnabled === null || isEnabled === undefined) return;
        
        this.ignoreEmpty = isEnabled;
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
        
        console.log('********* new update ************');
        
        if (oldChannel && newChannel) {
            if(oldChannel.id !== newChannel.id) {            
                const currentBotChannel = voiceConnection ? voiceConnection.channel : null;
                
                if (currentBotChannel && currentBotChannel.id === newChannel.id) {
                    console.log('join first');
                    this.queueJoinFirst(username, newChannel, oldChannel);
                } else if (currentBotChannel && currentBotChannel.id === oldChannel.id) {
                    console.log('exit first');
                    this.queueExitFirst(username, newChannel, oldChannel);
                } else {
                    console.log('any');
                    this.queueAnyOrder(username, newChannel, oldChannel);
                }
                
            }
        } else if (oldChannel) {
            if (this.shouldAnnounceTheExit(oldChannel.memberCount)) {
                this.queueAnnouncement(username, oldChannel, false);
            }
        } else if (newChannel) {
            if (this.shouldAnnounceTheJoin(newChannel.memberCount)) {
                this.queueAnnouncement(username, newChannel, true);
            }
        }
    }
    
    queueJoinFirst(username, newChannel, oldChannel) {
        const onJoinAnnounced = function() {
            console.log('on join announced');
            if (this.shouldAnnounceTheExit(oldChannel.memberCount)) {
                console.log('exit announce');
                Announcement.CreateAnnouncement(username, oldChannel, false).then(this.queueAnnouncementAndStart.bind(this))
            } else {
                console.log('skipping exit announce');
            }
        };
        
        if (this.shouldAnnounceTheJoin(newChannel.memberCount)) {
            console.log('announce join');
            Announcement.CreateAnnouncement(username, newChannel, true).then(
                this.queueAnnouncementAsync.bind(this)
            ).then(onJoinAnnounced.bind(this));
            
            return;
        } else {
            console.log('skipping init join announce');
        }
        
        if (this.shouldAnnounceTheExit(oldChannel.memberCount)) {
            console.log('announce exit only');
            this.queueAnnouncement(username, oldChannel, false);
        } else {
            console.log('skipping end exit');
        }
    }
    
    queueExitFirst(username, newChannel, oldChannel) {
        const onExitAnnounced = function() {
            console.log('on exit announced');
            if (this.shouldAnnounceTheJoin(newChannel.memberCount)) {
                console.log('join announce');
                Announcement.CreateAnnouncement(username, newChannel, true).then(this.queueAnnouncementAndStart.bind(this))
            } else {
                console.log('skipping join announce');
            }
        };
        
        if (this.shouldAnnounceTheExit(oldChannel.memberCount)) {
            console.log('announce exit');
            Announcement.CreateAnnouncement(username, oldChannel, false).then(
                this.queueAnnouncementAsync.bind(this)
            ).then(onExitAnnounced.bind(this));
            
            return;
        } else {
            console.log('skipping init exit announce');
        }
        
        if (this.shouldAnnounceTheJoin(newChannel.memberCount)) {
            console.log('announce join only');
            this.queueAnnouncement(username, newChannel, true);
        } else {
            console.log('skipping end join');
        }
    }
    
    queueAnyOrder(username, newChannel, oldChannel) {
        console.log('queue any order');
        if (this.shouldAnnounceTheJoin(newChannel.memberCount)) {
            this.queueAnnouncement(username, newChannel, true);
        }
        
        if (this.shouldAnnounceTheExit(oldChannel.memberCount)) {
            this.queueAnnouncement(username, oldChannel, false);
        }
    }
    
    queueAnnouncement(username, channel, entered) {        
        console.log('announcing and starting promise');
        Announcement.CreateAnnouncement(username, channel, entered).then(this.queueAnnouncementAndStart.bind(this), err => { console.error(err); });
    }
    
    startAnnouncing() {
        if (!this.announcing) {
            this.annouceNextUser();
        }
    }
    
    annouceNextUser() {
        this.announcing = true;
        const announcement = this.announceQueue.dequeue();
        
        if (announcement) {
            this.announce(announcement);
        } else {
            this.announcing = false;
        }
    }
    
    announce(announcement) {
        if (announcement && announcement.channel && announcement.stream) {
            announcement.channel.join().then(this.onChannelJoined.bind(this, announcement));
        } else {
            console.log('something was null in the announcement - skipping', announcement);
            this.annouceNextUser();
        }
    }
    
    onChannelJoined(announcement, connection) {
        const dispatcher = connection.play(announcement.stream);                
                dispatcher.on('end', () => { 
                    //console.log('ended!');
                    //announcement.stream.destroy(new Error('error destroying'));
                    //announcement.channel.leave();
                    this.annouceNextUser();
                });
    }
    
    queueAnnouncementAsync(ann) {
        const that = this;
        return new Promise((resolve, reject) => {
            try {
                console.log('announce queued async');
                that.announceQueue.enqueue(ann);
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    }
    
    queueAnnouncementAndStart(ann) {
        console.log('queueing and then starting');
        this.announceQueue.enqueue(ann);
        this.startAnnouncing();
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
    
    shouldAnnounceTheJoin(memberCount) {
        console.log('join: ' + memberCount);
        return this.shouldAnnounceJoins() && (!this.ignoreEmpty || (this.ignoreEmpty && memberCount > 0));
    }
    
    shouldAnnounceTheExit(memberCount) {
        console.log('exit: ' + memberCount);
        return this.shouldAnnounceExits() && (!this.ignoreEmpty || (this.ignoreEmpty && memberCount > 0));
    }
}

export default Announcer;