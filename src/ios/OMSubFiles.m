//
//  OmSubFiles.m
//  CordovaLib
//
//  Created by omkeeper on 2020/03/30.
//
//

#import "OmSubFiles.h"
#import "OMFileProtocols.h"

@implementation OmSubFiles

- (void)pluginInitialize
{
    [NSURLProtocol registerClass:[OMFileProtocols class]];
}

@end
